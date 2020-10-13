# Pulumi / Docker / Azure / ASP.NET 

This repo is a template for creating ASP Net Core React apps, deployed to Azure Web Apps using Pulumi.

> This repository was created for NDC Sydney 2020

# Repo Structure

## Pulumi

The Pulumi components can be found under `/src/infra`

## ASP .NET Core

The ASP .NET Core components are found under `/src/app`

## Github Actions

The GitHub action definitions are under `/.github/workflows`

# Notes

## Setting the Azure Tenent Id

```sh
pulumi config set azure:tenantId $(az account show --query tenantId -o tsv)
```

## Setting the Azure Subscription Id

when in CI, Pulumi needs to know what sub to deploy to

```sh
pulumi config set azure:subscriptionId $(az account show --query id -o tsv)
```

## The service principal needs access to the keyvault in order to create the secret

Get the appId and ObjectId of the service principal

```sh
az ad sp show --id http://template --query objectId
az ad sp show --id http://template --query appId
```

now add these to your list of ids in [the configuration](src/infra/Pulumi.dev.yaml)

## Setting up access for the local user

### Get your own object id

```sh
az ad user show --id $(az account show --query user.name -o tsv) --query objectId --out tsv
```

and copy that into [Pulumi.dev.yaml](infra/Pulumi.dev.yaml)

```yml
azure:identities:
  - name: rian
    objectId: 00000000-f9e7-4df0-b40c-0000000000
```
