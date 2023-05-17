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

/**
 * Test to match data types:
 * 1. Create table locally and in planetscale
 * 
 *    create table data_type (
 *       `decimal` decimal,
 *       `tinyint` tinyint,
 *       `tinyint_u` tinyint unsigned,
 *       `smallint` smallint,
 *       `smallint_u` smallint unsigned,
 *       `int` int,
 *       `int_u` int unsigned,
 *       `float` float,
 *       `double` double,
 *       `timestamp` timestamp,
 *       `bigint` bigint,
 *       `bigint_u` bigint unsigned,
 *       `mediumint` mediumint,
 *       `mediumint_u` mediumint unsigned,
 *       `date` date,
 *       `time` time,
 *       `datetime` datetime,
 *       `year` year,
 *       `varchar` varchar(10),
 *       `bit` bit,
 *       `json` json,
 *       `enum` enum('a', 'b'),
 *       `set` set('a', 'b'),
 *       `tinyblob` tinyblob,
 *       `tinytext` tinytext,
 *       `mediumblob` mediumblob,
 *       `mediumtext` mediumtext,
 *       `longblob` longblob,
 *       `longtext` longtext,
 *       `blob` blob,
 *       `varbinary` varbinary(10),
 *       `char` char,
 *       `binary` binary,
 *       `geometry` geometry
 *     );
 * 
 * 2. Run query for both databases
 *     select * from data_type; 
 * 
 * 3. Match the 'types' field from the their results
 */
function extractType(type, flags) {
  const {Types} = mysql;
  // Refer to https://dev.mysql.com/doc/dev/mysql-server/latest/group__group__cs__column__definition__flags.html
  // for the bitmask values
  const isUnsigned = !!(flags & 32); 
  const isBinary = !!(flags & 128);

  // Convert mysql types to @planetscale/database:
  // https://github.com/planetscale/database-js/blob/main/src/index.ts#L337
  switch (type) {
    case Types.TINY:    
      return isUnsigned ? 'UINT8' : 'INT8';  
    case Types.SHORT:
      return isUnsigned ? 'UINT16' :  'INT16';
    case Types.INT24:   
      return isUnsigned ? 'UINT24' :  'INT24';
    case Types.LONG:    
      return isUnsigned ? 'UINT32' :  'INT32';
    case Types.LONGLONG:
      return isUnsigned ? 'UINT64' :  'INT64';
    case Types.FLOAT:   
      return 'FLOAT32';
    case Types.DOUBLE: 
      return 'FLOAT64';
    case Types.VAR_STRING:
      // varbinary, varchar
      return isBinary ? 'VARBINARY' : 'VARCHAR';
    case Types.STRING:
      const isEnum = !!(flags & 256);
      const isSet = !!(flags & 2048);
      // enum, set, char, binary
      return isEnum ? 'ENUM' : isSet ? 'SET' : isBinary ? 'BINARY' : 'CHAR';
    case Types.NEWDECIMAL:
      return 'DECIMAL';
    case Types.BLOB:
      // tinyblob, mediumblob, longblob, tinytext, mediumtext, longtext
      return isBinary ? 'BLOB' : 'TEXT';
  
    default:
      return Types[type];
  }
}

function extractFields(fields = []) {
  return fields.map(f => ({
    name: f.name,
    type: extractType(f.type, f.flags),
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
  }));
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

      const fields = extractFields(_fields);

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