const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const db_host = "db-mysql-nyc1-35246-do-user-13689167-0.c.db.ondigitalocean.com";
const db_user = "doadmin";
const db_port = 25060;
const db_password = "AVNS_2x2McnsyjurtZXh2i0I";
const db_name = "condidate";
const apiSecretKey = "test_sk_I0qMA5IjeWBnL8ISZISQItxOYkOUvzsXKFDTI4tn";
const apiKey = "test_pk_8UhBFl3ojxdyeKQnwWQTy4gQJnrxkfqk1jT8BFhy";


const db = mysql.createConnection({
  host: db_host ,
  user: db_user,
  port: db_port,
  password: db_password,
  database: db_name
});

db.connect((err) => {
  if (err) {
    console.error('Database connection error:', err);
    throw err;
  }
  console.log('MySQL connected...');
});

app.use(cors({
  origin: process.env.CORS_ORIGIN
}));

const createUsersTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      lastName VARCHAR(255),
      firstName VARCHAR(255),
      phoneNumber VARCHAR(255),
      invoice_id VARCHAR(255),
      dateOfBirth DATE,
      sex VARCHAR(255),
      state VARCHAR(255),
      municipality VARCHAR(255),
      idCardFront VARCHAR(255),
      idCardBack VARCHAR(255),
      signature VARCHAR(255),
      selfie VARCHAR(255),
      paymentStatus BOOLEAN DEFAULT FALSE,
      paymentDate DATETIME
    );
  `;
  db.query(sql, (err, result) => {
    if (err) {
      console.error('Error creating users table:', err);
      throw err;
    }
    console.log('Users table created or exists already.');
  });
};
createUsersTable();

const createContactsTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS contacts (
      id VARCHAR(36) PRIMARY KEY,
      firstName VARCHAR(255),
      lastName VARCHAR(255),
      phoneNumber VARCHAR(255),
      email VARCHAR(255),
      message TEXT
    );
  `;
  db.query(sql, (err, result) => {
    if (err) {
      console.error('Error creating contacts table:', err);
      throw err;
    }
    console.log('Contacts table created or exists already.');
  });
};
createContactsTable();

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.post('/gt/register', upload.fields([
  { name: 'idCardFront', maxCount: 1 },
  { name: 'idCardBack', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Received registration request:', req.body);
    console.log('Files received:', req.files);

    const { lastname, firstName, phoneNumber, dateOfBirth, sex, state, municipality } = req.body;

    if (!req.files['idCardFront'] || !req.files['idCardBack'] || !req.files['signature'] || !req.files['selfie']) {
      console.error('Missing files');
      res.status(400).send('Missing required files');
      return;
    }

    const idCardFront = req.files['idCardFront'][0].filename;
    const idCardBack = req.files['idCardBack'][0].filename;
    const signature = req.files['signature'][0].filename;
    const selfie = req.files['selfie'][0].filename;
    
    const options = {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiSecretKey}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({"name": `${firstName} ${lastname}` ,"email": "ouss1234@gmail.com","phone": phoneNumber}),
    };
    
    let response = await fetch('https://pay.chargily.net/test/api/v2/customers', options); 
    let user = await response.json();
  
    const sql = `INSERT INTO users (id, lastName, firstName, phoneNumber, dateOfBirth, sex, state, municipality, idCardFront, idCardBack, signature, selfie)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [user.id, lastname, firstName, phoneNumber, dateOfBirth, sex, state, municipality, idCardFront, idCardBack, signature, selfie];

    db.query(sql, values, async (err, result) => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).send({err: err, msg: "db error"});
        return;
      }

      const options = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiSecretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 2000,
          currency: 'dzd',
          success_url: `${process.env.SUCCESS_URL}?userId=${user.id}`,
          customer_id: user.id,
        })
      };

      try {
        const response = await fetch('https://pay.chargily.dz/test/api/v2/checkouts', options);
        const paymentData = await response.json();
        if (paymentData && paymentData.checkout_url) {
          console.log('Payment link created:', paymentData.checkout_url);
          res.status(200).send({ message: 'User registered successfully', userId: user.id, paymentLink: paymentData.checkout_url });
        } else {
          console.error('Payment creation error:', paymentData);
          res.status(500).send('Failed to create payment');
        }
      } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).send('Failed to create payment');
      }
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(400).send('Error processing request');
  }
});

app.post('/gt/submitContact', (req, res) => {
  console.log('Received contact submission request');
  const { firstName, lastName, phoneNumber, email, message } = req.body;
  const contactId = uuidv4();

  const sql = `INSERT INTO contacts (id, firstName, lastName, phoneNumber, email, message)
               VALUES (?, ?, ?, ?, ?, ?)`;
  const values = [contactId, firstName, lastName, phoneNumber, email, message];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).send('Server error');
      return;
    }
    res.status(200).send({ message: 'Contact form submitted successfully', contactId });
  });
});

// Webhook endpoint for Chargily
app.post('/gt/webhook', (req, res) => {
  console.log('Webhook received with body:', req.body);
  const signature = req.get('signature');
  const payload = JSON.stringify(req.body);

  if (!signature) {
    console.log('Missing signature');
    return res.status(400).send('Missing signature');
  }

  const computedSignature = crypto.createHmac('sha256', apiKey)
    .update(payload)
    .digest('hex');

  console.log('Received Signature:', signature);
  console.log('Computed Signature:', computedSignature);

  if (computedSignature !== signature) {
    console.log('Invalid signature');
    return res.status(403).send('Invalid signature');
  }

  const event = req.body;

  try {
    switch (event.type) {
      case 'checkout.paid':
        const checkout = event.data;

        // Ensure we have the expected data
        if (!checkout || !checkout.created_at || !checkout.invoice_id || !checkout.customer_id) {
          console.log('Missing expected data in the event payload:', checkout);
          return res.status(400).send('Missing expected data in the event payload');
        }

        const paymentDate = new Date(checkout.created_at * 1000); // Assuming created_at is a Unix timestamp

        db.query(
          'UPDATE users SET paymentStatus = TRUE, paymentDate = ?, invoice_id = ? WHERE id = ?',
          [paymentDate, checkout.invoice_id, checkout.customer_id],
          (err, result) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).send('Database error');
            }

            console.log(`Payment status updated for user ${checkout.customer_id}`);
            res.status(200).send('Payment status updated');
          }
        );
        break;
      case 'checkout.failed':
        res.status(403).send('Payment failed');
        break;
      default:
        res.status(403).send('Event type not handled');
        break;
    }
  } catch (error) {
    console.error('Error handling webhook event:', error);
    res.status(500).send('Internal Server Error');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
