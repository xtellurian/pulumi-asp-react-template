import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";

// use first 10 characters of the stackname as prefix for resource names
const prefix = pulumi.getStack().substring(0, 9);

const resourceGroup = new azure.core.ResourceGroup(`${prefix}-rg`);

const resourceGroupArgs = {
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
};

// Storage Account name must be lowercase and cannot have any dash characters
const storageAccountName = `${prefix.toLowerCase().replace(/-/g, "")}sa`;
const storageAccount = new azure.storage.Account(storageAccountName, {
  ...resourceGroupArgs,

  accountKind: "StorageV2",
  accountTier: "Standard",
  accountReplicationType: "LRS",
});

const appServicePlan = new azure.appservice.Plan(`${prefix}-asp`, {
  ...resourceGroupArgs,
  reserved: true,
  kind: "Linux",
  sku: {
    tier: "Basic",
    size: "B1",
  },
});

const storageContainer = new azure.storage.Container(`${prefix}-c`, {
  storageAccountName: storageAccount.name,
  containerAccessType: "private",
});

const table = new azure.storage.Table(`${prefix}-table`, {
  storageAccountName: storageAccount.name,
  name: "data",
});

const appInsights = new azure.appinsights.Insights(`${prefix}-ai`, {
  ...resourceGroupArgs,

  applicationType: "web",
});

const acr = new azure.containerservice.Registry("acr", {
  ...resourceGroupArgs,
  adminEnabled: true,
  sku: "Standard",
});

const imageName = pulumi.interpolate`${acr.loginServer}/app`;

const app = new azure.appservice.AppService(`${prefix}-as`, {
  ...resourceGroupArgs,

  appServicePlanId: appServicePlan.id,
  appSettings: {
    APPINSIGHTS_INSTRUMENTATIONKEY: appInsights.instrumentationKey,
    APPLICATIONINSIGHTS_CONNECTION_STRING: pulumi.interpolate`InstrumentationKey=${appInsights.instrumentationKey}`,
    ApplicationInsightsAgent_EXTENSION_VERSION: "~2",
    DOCKER_REGISTRY_SERVER_PASSWORD: acr.adminPassword,
    DOCKER_REGISTRY_SERVER_URL: pulumi.interpolate`https://${acr.loginServer}`,
    DOCKER_REGISTRY_SERVER_USERNAME: acr.adminUsername,
    WEBSITES_ENABLE_APP_SERVICE_STORAGE: "false",
  },
  siteConfig: {
    alwaysOn: true,
    linuxFxVersion: pulumi.interpolate`DOCKER|${imageName}:latest`,
  },

  connectionStrings: [
    {
      name: "storage",
      value: storageAccount.primaryConnectionString.apply((t) => t),
      type: "Custom",
    },
  ],
});
export const acrName = acr.name;
export const endpoint = pulumi.interpolate`https://${app.defaultSiteHostname}`;