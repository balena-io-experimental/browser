#!/bin/bash
set -e

function build_and_push_image () {
  local DOCKER_REPO=$1
  local BALENA_MACHINE_NAME=$2
  local DOCKER_ARCH=$3
  local DOCKERFILE_DIR=./generic

  # The RPIs all use the same dockerfile for now
  if [[ $BALENA_MACHINE_NAME = raspberry* ]]; then
    DOCKERFILE_DIR=./rpi
  fi

  echo "Building for machine name $BALENA_MACHINE_NAME, platform $DOCKER_ARCH using dockerfile from $DOCKERFILE_DIR, pushing to $DOCKER_REPO/browser"

  sed "s/%%BALENA_MACHINE_NAME%%/$BALENA_MACHINE_NAME/g" $DOCKERFILE_DIR/Dockerfile.template > ./Dockerfile.$BALENA_MACHINE_NAME
  docker buildx build -t $DOCKER_REPO/browser:V1-$BALENA_MACHINE_NAME --platform $DOCKER_ARCH --file Dockerfile.$BALENA_MACHINE_NAME .

  echo "Publishing..."
  docker push $DOCKER_REPO/browser:$BALENA_MACHINE_NAME

  echo "Cleaning up..."
  rm Dockerfile.$BALENA_MACHINE_NAME
}

function retag_and_push_image () {
  local DOCKER_REPO=$1
  local BUILT_TAG="V1-$2"
  local NEW_TAG="V1-$3"

  echo "Taging $DOCKER_REPO/browser:$BUILT_TAG as $DOCKER_REPO/browser:$NEW_TAG"
  docker tag $DOCKER_REPO/browser:$BUILT_TAG $DOCKER_REPO/browser:$NEW_TAG

  echo "Publishing..."
  docker push $DOCKER_REPO/browser:$NEW_TAG
}

# YOu can pass in a repo (such as a test docker repo) or accept the default
DOCKER_REPO=${1:-balenablocks}
BLOCK_NAME="browser"

#RPI4 is built as ARMv7 because the base Raspian image is 32-bit
build_and_push_image $DOCKER_REPO "raspberrypi3" "linux/arm/v7"
build_and_push_image $DOCKER_REPO "genericx86-64-ext" "linux/amd64"

# #only need to build once per arch, and retag & push for clones
retag_and_push_image $DOCKER_REPO "raspberrypi3" "raspberrypi4-64"
# # retag_and_push_image $DOCKER_REPO "raspberrypi3" "raspberrypi3-64"
retag_and_push_image $DOCKER_REPO "raspberrypi3" "fincm3"

# docker manifest rm $DOCKER_REPO/$BLOCK_NAME:V1 || true
docker manifest create $DOCKER_REPO/$BLOCK_NAME:V1 --amend $DOCKER_REPO/$BLOCK_NAME:V1-raspberrypi3 --amend $DOCKER_REPO/$BLOCK_NAME:V1-raspberrypi4-64 --amend $DOCKER_REPO/$BLOCK_NAME:V1-genericx86-64-ext
docker manifest annotate --arch arm64 $DOCKER_REPO/$BLOCK_NAME:V1 $DOCKER_REPO/$BLOCK_NAME:V1-raspberrypi4-64
docker manifest annotate --variant v8 $DOCKER_REPO/$BLOCK_NAME:V1 $DOCKER_REPO/$BLOCK_NAME:V1-raspberrypi4-64
docker manifest push $DOCKER_REPO/$BLOCK_NAME:V1