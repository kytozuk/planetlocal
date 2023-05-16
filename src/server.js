import http from 'node:http';
import mysql from 'mysql2';

let inTransaction = false;
let db;

export async function start({user, password, database, port} = {}) {
  db = mysql.createConnection({
    host: 'localhost',
    user,
    password,
    database,
  });

  await new Promise((resolve, reject) => {
    db.connect((err) => {
      if (err) {
        return reject('Error connecting: ' + err.stack);
      }
      resolve();
    });
  });

  const handleRequest = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', '*');
  
    let result;

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
    }

    // Handle root path '/'
    else if (req.url === '/') {
      res.setHeader('Content-Type', 'application/json');
      // GET
      if (req.method === 'GET') {
        res.writeHead(200);
        result = {status: 'OK'};
      } 
      // POST
      else if (req.method === 'POST') {
        let body = '';
        await new Promise((resolve) => {
          req.on('data', (chunk) => body += chunk.toString());
          req.on('end', () => resolve());
        });

        let query;

        try {
          body = JSON.parse(body);
          query = body.query;
        } catch (error) {
           // Noop  
        }

        if (!query) {
          res.writeHead(400);
          result = {error: 'Invalid query'};
        }
        else {
          const queryResult = await handleQuery(query);
          if (queryResult.error) {
            res.writeHead(500);
            result = {error: queryResult.error};
          } else {
            result = queryResult;
          }
        }
      }

      result = JSON.stringify(result);
    } 

    // Return 404 on all other routes
    else {
      res.writeHead(404);
    }

    res.end(result);
  };

  http.createServer(handleRequest).listen(port, () => {
    console.log(`planetlocal running on: http://localhost:${port} | Connected to MySQL as: ${db.threadId}`)
  });
}

async function handleQuery(sql = '') {
  if (query === 'BEGIN') {
    if (inTransaction) { return {error: 'Transaction in progress!'} }
    inTransaction = true;
  } else if (query === 'COMMIT' || query === 'ROLLBACK') {
    inTransaction = false;
  }
  return query(sql);
}

async function query(sql) {
  let error;

  const result = await new Promise((resolve, reject) => {
    db.query(sql, (_error, _results, _fields) => {
      if (_error) { 
        error = {
          message: [
            _error.message,
            `(errno ${_error.errno})`,
            `(sqlstate ${_error.sqlState})`,
            `Sql: "${_error.sql}"`,
          ].join('\n'),
        }
        return resolve();
      }

      const fields = _fields?.map(f => ({
        name: f.name,
        type: mysql.Types[f.type],
        table: f.table,
        orgTable: f.orgTable,
        database: f.db,
        orgName: f.orgName,
        /**
         * Disabled - not in use by @planetscale/database
         */
        // columnLength: '',
        // charset: '',
        // flags: f.flags,
      })) || [];

      const rows = _results?.map ? _results.map(r => {
        const lengths = [];
        // Join all values as a long string
        const values = fields.map(({name}) => {
          let value = r[name];
          if (value === null) {
            lengths.push(-1);
            return '';
          }

          value = typeof value === 'string' ? value : `${value}`;
          lengths.push(value.length);
          return value;
        });
        return {
          values: btoa(values.join('')),
          lengths,
        }
      }) : [];

      resolve({
        fields,
        rows,
        insertId: _results.insertId,
        rowsAffected: _results.affectedRows,
      });
    });
  });

  return {result, error};
}