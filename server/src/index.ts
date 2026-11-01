import { createServer } from 'node:http'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { createSocketServer } from './realtime/socket.js'

const server = createServer(createApp())
createSocketServer(server)

server.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`)
})
