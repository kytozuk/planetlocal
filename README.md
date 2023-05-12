# Local HTTP interface for PlanetScale's Javascript Serverless Driver

A minimal HTTP server that allows you to use [PlanetScale Javascript Driver](https://github.com/planetscale/database-js) to connect to a local instance of MySQL. 

Useful for rapid development while saving those precious reads and writes. Supports [transaction](https://github.com/planetscale/database-js#transactions).

## Usage

In a terminal window separate from your application, run: 

```
npx planetlocal@latest --user <username> --password <password> --database <database>
```

Replace `<username>` and `<password>` with your MySQL credentials, and `<database>` with the name of the database you want to connect.

The default port is `4545`, but you can specify a different one using the `--port` command:

```
--port 3030
```


## Connecting to the local server
When instantiating **@planetscale/database** in your app, provide a custom `fetch()` to PlanetScale's config and use `http://localhost:4545` as the url. Note: `host`, `username` and `password` fields can be omitted.

```js
import { connect } from '@planetscale/database';

// Establish connection
const conn = connect({
  fetch: (url, init) => {
    return fetch('http://localhost:4545', init);
  }	
});

// Run query
const queryResult = await conn.execute('SELECT * FROM users');

// Run transaction
const transactionResult = await conn.transaction(async (tx) => {
  const a = await tx.execute('INSERT INTO users (name) VALUES (:name)', {name: 'Alice'});

  const b = await tx.execute('INSERT INTO users (name) VALUES (:name)', {name: 'Ben'});

  return [a, b];
})
```

## License
MIT