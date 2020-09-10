#!/bin/bash
set -e
pushd infra
ACR_NAME=$1
popd
pushd app
az acr login -n $ACR_NAME
docker build -t $ACR_NAME.azurecr.io/app:latest .
docker push $ACR_NAME.azurecr.io/app:latest
