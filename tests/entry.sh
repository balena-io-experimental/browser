#!/bin/bash

echo "### TEST START $TEST_ID ###"
 
npm run test 

exit=$(echo $?)

echo "### TEST RESULT $TEST_ID $exit ###"
