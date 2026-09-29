const fs = require('fs');
const { PersistenceService } = require('./src/store.js');
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const persistence = new PersistenceService('data', config.masterKey);
const db = persistence.read('db.json', {});
console.log(db.users);
