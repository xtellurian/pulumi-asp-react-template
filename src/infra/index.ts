import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";
import { AzureId } from "./azureId";
import * as docker from "@pulumi/docker";

// Get configuration values for this stack.
const rootConfig = new pulumi.Config();
const azureConfig = new pulumi.Config("azure");
const tenantId = azureConfig.require("tenantId");

// Check, and don't deploy if Friday
const dayOfWeek = new Date().getDay();
if (!pulumi.runtime.isDryRun() && dayOfWeek === 5) {
  throw new Error("Don't deploy on Friday!");
} else if (!pulumi.runtime.isDryRun()) {
  console.log("Not a Friday. Continuing...");
}

// use first 10 characters of the stackname as prefix for resource names
const prefix = pulumi.getStack().substring(0, 9);

// Create an Azure Resource Group
const resourceGroup = new azure.core.ResourceGroup(`${prefix}-rg`, {
  name: `${prefix}`,
  tags: {
    project: pulumi.getProject(),
    stack: pulumi.getStack(),
  },
});

// Helper object
const resourceGroupArgs = {
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
};

// create a keyvault
const keyVault = new azure.keyvault.KeyVault(`${prefix}-kv`, {
  ...resourceGroupArgs,

  skuName: "standard",
  tenantId,
});

// Storage Account name must be lowercase and cannot have any dash characters
const storageAccountName = `${prefix.toLowerCase().replace(/-/g, "")}sa`;
const storageAccount = new azure.storage.Account(storageAccountName, {
  ...resourceGroupArgs,

  accountKind: "StorageV2",
  accountTier: "Standard",
  accountReplicationType: "LRS",
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

// Create the Container Registry, App Service Plan, and Website
const dockerTagPrefix = rootConfig.get("tagPrefix") || "latest";
const fullImage = pulumi.interpolate`${acr.name}.azurecr.io/app:${dockerTagPrefix}`;
const appImage = new docker.Image("appImage", {
  imageName: fullImage,
  build: {
    context: `../app`,
  },
  registry: {
    server: acr.loginServer,
    username: acr.adminUsername,
    password: acr.adminPassword,
  },
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
    KeyVaultUri: keyVault.vaultUri,
    StorageAccount__TableName: table.name,
  },
  siteConfig: {
    alwaysOn: true,
    linuxFxVersion: pulumi.interpolate`DOCKER|${appImage.imageName}`,
  },
  identity: {
    type: "SystemAssigned", // Assign the Web App an Azure Identity
  },
});

// Create KeyVault Access Policies
const identities = azureConfig.requireObject<AzureId[]>("identities");
// keep track of the access policies in an array
const keyVaultAccessPolicies: azure.keyvault.AccessPolicy[] = [];
// create an access policy for each identity
identities.forEach((i) => {
  const objectIdAccessPolicy = new azure.keyvault.AccessPolicy(`${i.name}-kv`, {
    keyVaultId: keyVault.id,
    objectId: i.objectId,
    tenantId,
    secretPermissions: ["list", "get", "set", "delete"], // need delete for pulumi destroy
  });
  keyVaultAccessPolicies.push(objectIdAccessPolicy);

  if (i.appId) {
    // sometimes there's an Application Id
    const appIdAccessPolicy = new azure.keyvault.AccessPolicy(
      `${i.name}-app-kv`,
      {
        keyVaultId: keyVault.id,
        objectId: i.objectId,
        applicationId: i.appId,
        tenantId,
        secretPermissions: ["list", "get", "set", "delete"], // need delete for pulumi destroy
      }
    );
    keyVaultAccessPolicies.push(appIdAccessPolicy);
  }
});

// add the App Service, but only enable get for secrets
const appAccessPolicy = new azure.keyvault.AccessPolicy("app-kv", {
  keyVaultId: keyVault.id,
  objectId: app.identity.apply(
    (i) => i.principalId || "11111111-1111-1111-1111-111111111111" // workaround for a bug when principalId is null
  ),
  tenantId,
  secretPermissions: ["list", "get", "set", "delete"], // need delete for pulumi destroy
});

// store the connection string in the key vault
const connectionStringSecret = new azure.keyvault.Secret(
  `${prefix}-sacs`,
  {
    keyVaultId: keyVault.id,
    name: "StorageAccount--ConnectionString",
    value: storageAccount.primaryConnectionString,
  },
  {
    dependsOn: keyVaultAccessPolicies, // ensure we have access to the KV before tring to create a secret
  }
);

// DEMO SECRET
const sampleSecret = new azure.keyvault.Secret(
  `${prefix}-sample`,
  {
    keyVaultId: keyVault.id,
    name: "Summary",
    value: "IT'S COLD!",
  },
  {
    dependsOn: keyVaultAccessPolicies, // ensure we have access to the KV before tring to create a secret
  }
);

// Stack Exports
export const rg = resourceGroup.name;
export const appName = app.name;
export const acrName = acr.name;
export const endpoint = pulumi.interpolate`https://${app.defaultSiteHostname}`;
export const kvUri = keyVault.vaultUri;
