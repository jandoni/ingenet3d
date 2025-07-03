###

FROM node:21-alpine

RUN npm install -g http-server

WORKDIR /home/node

COPY ./src .
COPY ./demo/src ./demo

ARG API_KEY

RUN cp env.example.js env.js
RUN sed -i -r "s/<API_KEY>/${API_KEY}/g" env.js
# Keep index.html unchanged (sidebar functionality removed)

# The default port of the application
EXPOSE  8080

CMD ["http-server", "-p", "8080", "."]
