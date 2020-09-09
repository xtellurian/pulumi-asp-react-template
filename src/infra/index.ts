import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";
import { AzureId } from "./azureId";
const azureConfig = new pulumi.Config("azure");
const tenantId = azureConfig.require("tenantId");
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

  kind: "App",

  sku: {
    tier: "Basic",
    size: "B1",
  },
});

const storageContainer = new azure.storage.Container(`${prefix}-c`, {
  storageAccountName: storageAccount.name,
  containerAccessType: "private",
});

const blob = new azure.storage.Blob(`${prefix}-b`, {
  storageAccountName: storageAccount.name,
  storageContainerName: storageContainer.name,
  type: "Block",

  source: new pulumi.asset.FileArchive("wwwroot"),
});

const codeBlobUrl = azure.storage.signedBlobReadUrl(blob, storageAccount);

const appInsights = new azure.appinsights.Insights(`${prefix}-ai`, {
  ...resourceGroupArgs,

  applicationType: "web",
});

const username = "pulumi";

// Get the password to use for SQL from config.
const config = new pulumi.Config();
const pwd = config.require("sqlPassword");

const sqlServer = new azure.sql.SqlServer(`${prefix}-sql`, {
  ...resourceGroupArgs,

  administratorLogin: username,
  administratorLoginPassword: pwd,
  version: "12.0",
});

const database = new azure.sql.Database(`${prefix}-db`, {
  ...resourceGroupArgs,
  serverName: sqlServer.name,
  requestedServiceObjectiveName: "S0",
});

// create a keyvault
const keyVault = new azure.keyvault.KeyVault(`${prefix}-kv`, {
  ...resourceGroupArgs,

  skuName: "standard",
  tenantId,
});

const app = new azure.appservice.AppService(`${prefix}-as`, {
  ...resourceGroupArgs,

  appServicePlanId: appServicePlan.id,

  appSettings: {
    APPINSIGHTS_INSTRUMENTATIONKEY: appInsights.instrumentationKey,
    APPLICATIONINSIGHTS_CONNECTION_STRING: pulumi.interpolate`InstrumentationKey=${appInsights.instrumentationKey}`,
    ApplicationInsightsAgent_EXTENSION_VERSION: "~2",
    WEBSITE_RUN_FROM_PACKAGE: codeBlobUrl,
    KeyVaultUri: keyVault.vaultUri,
  },
  identity: {
    type: "SystemAssigned",
  },
  connectionStrings: [
    {
      name: "db",
      value: pulumi
        .all([sqlServer.name, database.name])
        .apply(
          ([server, db]) =>
            `Server=tcp:${server}.database.windows.net;initial catalog=${db};user ID=${username};password=${pwd};Min Pool Size=0;Max Pool Size=30;Persist Security Info=true;`
        ),
      type: "SQLAzure",
    },
  ],
});

// ACCESS POLICIES
// keep track of the access policies
const keyVaultAccessPolicies: azure.keyvault.AccessPolicy[] = [];
// get the list of identities from the config
const identities = azureConfig.requireObject<AzureId[]>("identities");
// create an access policy for each identity
identities.forEach((i) => {
  const objectIdAccessPolicy = new azure.keyvault.AccessPolicy(`${i.name}-kv`, {
    keyVaultId: keyVault.id,
    objectId: i.objectId,
    tenantId,
    secretPermissions: ["list", "get", "set", "delete"], // need delete for pulumi destroy
  });
  keyVaultAccessPolicies.push(objectIdAccessPolicy);
});

// add the App Service, but only enable get for secrets
const appAccessPolicy = new azure.keyvault.AccessPolicy("app-kv", {
  keyVaultId: keyVault.id,
  objectId: app.identity.apply(
    (i) => i.principalId || "11111111-1111-1111-1111-111111111111"
  ),
  tenantId,
  secretPermissions: ["list", "get", "set", "delete"], // need delete for pulumi destroy
});
// store a sample secret as a demonstration
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

// store the connection string in the key vault
const connectionStringSecret = new azure.keyvault.Secret(
  `${prefix}-dbcs`,
  {
    keyVaultId: keyVault.id,
    name: "Database--ConnectionString",
    value: pulumi
      .all([sqlServer.name, database.name])
      .apply(
        ([server, db]) =>
          `Server=tcp:${server}.database.windows.net;initial catalog=${db};user ID=${username};password=${pwd};Min Pool Size=0;Max Pool Size=30;Persist Security Info=true;`
      ),
  },
  {
    dependsOn: keyVaultAccessPolicies, // ensure we have access to the KV before tring to create a secret
  }
);

export const endpoint = pulumi.interpolate`https://${app.defaultSiteHostname}`;
export const kvUri = keyVault.vaultUri;
