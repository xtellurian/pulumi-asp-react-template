#!/bin/bash

pushd infra
ACR_NAME=$(pulumi stack output acrName)
popd
pushd app
az acr login -n $ACR_NAME
docker build -t $ACR_NAME.azurecr.io/app:latest .
docker push $ACR_NAME.azurecr.io/app:latest
