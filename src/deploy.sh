#!/bin/bash
set -e
ACR_NAME=$1
pushd app
docker build -t $ACR_NAME.azurecr.io/app:latest .
docker push $ACR_NAME.azurecr.io/app:latest
