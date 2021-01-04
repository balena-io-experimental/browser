#!/bin/bash
set -e

function build_and_push_image () {
  local DOCKER_REPO=$1
  local BALENA_MACHINE_NAME=$2
  local DOCKER_ARCH=$3

  echo "Building for machine name $BALENA_MACHINE_NAME, platform $DOCKER_ARCH, pushing to $DOCKER_REPO/browser"

  # The RPIs all use the same dockerfile for now
  if [[ $BALENA_MACHINE_NAME = raspberry* ]]; then
    sed "s/%%BALENA_MACHINE_NAME%%/$BALENA_MACHINE_NAME/g" ./Dockerfile.raspberrypi > ./Dockerfile.$BALENA_MACHINE_NAME
  else
    sed "s/%%BALENA_MACHINE_NAME%%/$BALENA_MACHINE_NAME/g" ./Dockerfile.template > ./Dockerfile.$BALENA_MACHINE_NAME
  fi
  
  docker buildx build -t $DOCKER_REPO/browser:$BALENA_MACHINE_NAME --platform $DOCKER_ARCH --file Dockerfile.$BALENA_MACHINE_NAME .

  echo "Publishing..."
  docker push $DOCKER_REPO/browser:$BALENA_MACHINE_NAME

  echo "Cleaning up..."
  rm Dockerfile.$BALENA_MACHINE_NAME
}

function retag_and_push_image () {
  local DOCKER_REPO=$1
  local BUILT_TAG=$2
  local NEW_TAG=$3

  echo "Taging $DOCKER_REPO/browser:$BUILT_TAG as $DOCKER_REPO/browser:$NEW_TAG"
  docker tag $DOCKER_REPO/browser:$BUILT_TAG $DOCKER_REPO/browser:$NEW_TAG

  echo "Publishing..."
  docker push $DOCKER_REPO/browser:$NEW_TAG
}

# YOu can pass in a repo (such as a test docker repo) or accept the default
DOCKER_REPO=${1:-balenablocks}

#only need to build once per arch, and retag & push for clones
build_and_push_image $DOCKER_REPO "raspberrypi3" "linux/arm/v7"
#RPI4 is built as ARMv7 because there are currently (jan 2021) no 64-bit chromium sources from RPI
retag_and_push_image $DOCKER_REPO "raspberrypi3" "raspberrypi4-64"
retag_and_push_image $DOCKER_REPO "raspberrypi3" "raspberrypi3-64"
retag_and_push_image $DOCKER_REPO "raspberrypi3" "fincm3"

build_and_push_image $DOCKER_REPO "genericx86-64-ext" "linux/amd64"