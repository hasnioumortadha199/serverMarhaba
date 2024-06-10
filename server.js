const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();

const app = express();

app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  port: process.env.DB_PORT || '3307',
  password: process.env.DB_PASSWORD || 'mysql',
  database: process.env.DB_NAME || 'condidate'
});

db.connect((err) => {
  if (err) {
    console.error('Database connection error:', err);
    throw err;
  }
  console.log('MySQL connected...');
});

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
}));

const createUsersTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255),
      firstName VARCHAR(255),
      phoneNumber VARCHAR(255),
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
const upload = multer({ storage });

app.post('/register', upload.fields([
  { name: 'idCardFront', maxCount: 1 },
  { name: 'idCardBack', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]), async (req, res) => {
  try {
    const { name, firstName, phoneNumber, dateOfBirth, sex, state, municipality } = req.body;
    const idCardFront = req.files['idCardFront'][0].filename;
    const idCardBack = req.files['idCardBack'][0].filename;
    const signature = req.files['signature'][0].filename;
    const selfie = req.files['selfie'][0].filename;

    const userId = uuidv4();

    const sql = `INSERT INTO users (id, name, firstName, phoneNumber, dateOfBirth, sex, state, municipality, idCardFront, idCardBack, signature, selfie)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [userId, name, firstName, phoneNumber, dateOfBirth, sex, state, municipality, idCardFront, idCardBack, signature, selfie];

    db.query(sql, values, async (err, result) => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).send('Server error');
        return;
      }

      const options = {
        method: 'POST',
        headers: {
          Authorization: `Bearer test_sk_F6EMHwHlrFJbPWbiOej3ZSSMEAuINy2Giu3sOYLp`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 2000,
          currency: 'dzd',
          success_url: `${process.env.SUCCESS_URL}?userId=${userId}`
        })
      };

      try {
        const response = await fetch('https://pay.chargily.dz/test/api/v2/checkouts', options);
        const paymentData = await response.json();
        if (paymentData && paymentData.checkout_url) {
          res.status(200).send({ message: 'User registered successfully', userId, paymentLink: paymentData.checkout_url });
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

app.get('/payments/success', (req, res) => {
  const { userId } = req.query;

  const sql = `UPDATE users SET paymentStatus = TRUE, paymentDate = NOW() WHERE id = ?`;
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error('Database update error:', err);
      res.status(500).send('Server error');
      return;
    }
    res.redirect(`${process.env.SUCCESS_REDIRECT_URL}`);
  });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
