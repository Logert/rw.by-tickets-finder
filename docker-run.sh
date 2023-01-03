#!/bin/bash

# Start the first process
npm run start &

# Start the second process
npm run db:studio &

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?