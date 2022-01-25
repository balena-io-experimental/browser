#!/bin/bash
set -e

BLOCK_NAME="browser"

function build_image () {
  local DOCKER_REPO=$1
  local BALENA_MACHINE_NAME=$2
  local DOCKER_ARCH=$3

  echo "Building for machine name $BALENA_MACHINE_NAME, platform $DOCKER_ARCH, pushing to $DOCKER_REPO/$BLOCK_NAME"
  sed "s/%%BALENA_MACHINE_NAME%%/$BALENA_MACHINE_NAME/g" ./Dockerfile.template > ./Dockerfile.$BALENA_MACHINE_NAME
  
  docker buildx build -t $DOCKER_REPO/$BLOCK_NAME:$BALENA_MACHINE_NAME --load --platform $DOCKER_ARCH --file Dockerfile.$BALENA_MACHINE_NAME .
  docker push $DOCKER_REPO/$BLOCK_NAME:$BALENA_MACHINE_NAME

  echo "Cleaning up temporary dockerfiles..."
  rm Dockerfile.$BALENA_MACHINE_NAME
}

function retag_image () {
  local DOCKER_REPO=$1
  local BUILT_TAG=$2
  local NEW_TAG=$3

  echo "Taging $DOCKER_REPO/$BLOCK_NAME:$BUILT_TAG as $DOCKER_REPO/$BLOCK_NAME:$NEW_TAG"
  docker tag $DOCKER_REPO/$BLOCK_NAME:$BUILT_TAG $DOCKER_REPO/$BLOCK_NAME:$NEW_TAG

  # echo "Publishing..."
  docker push $DOCKER_REPO/$BLOCK_NAME:$NEW_TAG
}

function create_and_push_manifest() {
  local DOCKER_REPO=$1
  docker manifest rm $DOCKER_REPO/$BLOCK_NAME:latest || true
  docker manifest create $DOCKER_REPO/$BLOCK_NAME:latest --amend $DOCKER_REPO/$BLOCK_NAME:raspberrypi3 --amend $DOCKER_REPO/$BLOCK_NAME:raspberrypi4-64 --amend $DOCKER_REPO/$BLOCK_NAME:genericx86-64-ext
  docker manifest annotate --arch arm64 $DOCKER_REPO/$BLOCK_NAME:latest $DOCKER_REPO/$BLOCK_NAME:raspberrypi4-64
  docker manifest annotate --variant v8 $DOCKER_REPO/$BLOCK_NAME:latest $DOCKER_REPO/$BLOCK_NAME:raspberrypi4-64
  docker manifest push $DOCKER_REPO/$BLOCK_NAME:latest
}

# YOu can pass in a repo (such as a test docker repo) or accept the default
DOCKER_REPO=${1:-balenablocks}

#only need to build once per arch, and retag & push for clones
build_image $DOCKER_REPO "raspberrypi3" "linux/arm/v7"
#RPI4 is built as ARMv7 because there are currently (jan 2021) no 64-bit chromium sources from RPI
retag_image $DOCKER_REPO "raspberrypi3" "raspberrypi4-64"

build_image $DOCKER_REPO "genericx86-64-ext" "linux/amd64"

create_and_push_manifest $DOCKER_REPO