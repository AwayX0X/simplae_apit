const client = {};
client.express = require('express');
client.app = client.express();
client.app.use(client.express.urlencoded({ extended: true }));
client.mysql = require("mysql");
client._ = require("./config.json");

var db = client.mysql.createConnection({
  host     : client._.License_System.mysql_host,
  user     : client._.License_System.mysql_user,
  password : client._.License_System.mysql_password,
  database : client._.License_System.mysql_database,
  timezone : client._.License_System.mysql_timezone
});

db.connect(function(err) {
  if (err) {
    console.log('Error connecting to database');
    return setTimeout(() => { process.exit(0); }, 2500);
  } else {
    console.log('Connected successfully to the database');
  }
  setInterval(function () { db.query('SELECT 1'); }, 5000); // Keep the connection alive
});

// Set expired licenses by checking `total_time` values
setInterval(function(){
  // Directly compare the DATETIME field `total_time` with `NOW()` minus 5 minutes
  db.query("UPDATE list SET `valid` = 'false' WHERE `total_time` <= DATE_SUB(NOW(), INTERVAL 5 MINUTE);");
}, 60000); // Set expired licenses every minute

// Check if a date is valid
function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime()); // Returns true if the date is valid
}

// Endpoint to handle license validation
client.app.post('/license', (req, res) => {
  /*
  * authenticated = valid license (passed all checks)
  * ip = ip registered on the database is different from the requesting one
  * expired = license expired (valid = false)
  * invalid = license not registered in database or generic error
  * (return of a table to add any custom values)
  */
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  ip = ip.replace("::ffff:", ""); // Clean up the IP

  // Query to check the license in the database (Use parameterized queries to prevent SQL injection)
  db.query("SELECT * FROM list WHERE license = ?", [req.headers.license], function (err, result, fields) {
    if (err) {
      console.error('Error in SQL query:', err);
      return res.send({ status: "invalid" });
    }

    // If the license exists in the database
    if (result.length > 0) {
      const licenseData = result[0];
      
      // Check for invalid `total_time` field
      if (!isValidDate(licenseData.total_time)) {
        console.error(`Invalid date found for license ${licenseData.license}: ${licenseData.total_time}`);
        return res.send({ status: "invalid" });
      }

      // Handle the license based on IP and validity
      if (!licenseData.ip) {
        // If it's the first request and no IP is assigned, set it
        if (licenseData.valid === "true") {
          db.query("UPDATE list SET ip = ? WHERE license = ?", [ip, req.headers.license]);
          return res.send({ status: "authenticated" });
        } else {
          return res.send({ status: "expired" });
        }
      } else {
        if (licenseData.ip === ip) {
          // If the IP matches, check if the license is still valid
          if (licenseData.valid === "true") {
            return res.send({ status: "authenticated" });
          } else {
            return res.send({ status: "expired" });
          }
        } else {
          return res.send({ status: "ip" });
        }
      }
    } else {
      // If the license doesn't exist
      return res.send({ status: "invalid" });
    }
  });
}).listen(client._.License_System.express_port, () => {
  console.log(`License system running on port ${client._.License_System.express_port}`);
});
