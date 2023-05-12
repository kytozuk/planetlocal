#!/usr/bin/env node
import {start} from './server.js';

process.title = 'planetlocal';

let user;
let password;
let database;
let port = 4545;

for (let i=0; i<process.argv.length; i++) {
  const command = process.argv[i];
  const val = process.argv[i+1];
  switch (command) {
    case '--user':
      user = val; 
      break;

    case '--password':
      password = val; 
      break;

    case '--database':
      database = val;  
      break;

    case '--port':
      port = parseInt(val);
      if (isNaN(port)) { port = 4545 }
      break;
  
    default:
      break;
  }
}

await start({user, password, database, port});
