FROM node:latest
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm i
COPY . .
COPY docker-run.sh docker-run.sh
EXPOSE 5555
CMD npm run db:migrate; ./docker-run.sh