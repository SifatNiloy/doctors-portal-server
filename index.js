const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, Admin, ObjectId } = require('mongodb');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.otausu5.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.send(401).send({ message: 'UnAuthorized access' })
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded;
    next();
  });
}

const emailSenderOptions = {
  auth: {
    api_key: process.env.EMAIL_SENDER_KEY
  }
}

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions))

function sendAppointmentEmail(booking) {
  const { patient, patientName, treatment, date, slot } = booking;

  var email = {

    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
    text: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
    html: `
    <div>
    <h2>Hello ${patientName}</h2>
    <h3>Your appointment for ${treatment} is confirmed </h3>
    <p>Looking forward to see you on on ${date} at ${slot} </p>
    <h3>Our address</h3>
    <p>26/2 Banani, Dhaka</p>
    <p>Bangladesh</p>
    <a href="https://www.programming-hero.com/">unsubscribe</a>
    </div>
    `
  };

  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err)
    }
    else {
      console.log('Message sent : ', info)
    }
  });
}
function sendPaymentConfirmationEmail(booking) {
  const { patient, patientName, treatment, date, slot } = booking;

  var email = {

    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `We have received your payment for ${treatment} is on ${date} at ${slot} is confirmed`,
    text: `Your payment for this Appointment:  ${treatment} is on ${date} at ${slot} is confirmed`,
    html: `
    <div>
    <h2>Hello ${patientName}</h2>
    <h3> Thank you for your payment. </h3>
    <p>Looking forward to see you on on ${date} at ${slot} </p>
    <h3>Our address</h3>
    <p>26/2 Banani, Dhaka</p>
    <p>Bangladesh</p>
    <a href="https://www.programming-hero.com/">unsubscribe</a>
    </div>
    `
  };

  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err)
    }
    else {
      console.log('Message sent : ', info)
    }
  });
}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db('doctors_portal').collection('services');
    const bookingCollection = client.db('doctors_portal').collection('bookings');
    const userCollection = client.db('doctors_portal').collection('users');
    const doctorCollection = client.db('doctors_portal').collection('doctors'); 
    const paymentCollection = client.db('doctors_portal').collection('payments'); 

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester })
      if (requesterAccount.role === 'admin') {
        next();
      }
      else {
        res.status(403).send({ message: 'forbidden' });
      }
    }

    app.post('/create-payment-intent', async(req, res)=>{
      const service= req.body;
      const price= service.price;
      const amount= price*100;
      const paymentIntent= await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_methods_types: ['card']
      });
      res.send({ClientSecret : paymentIntent.client_secret})
    })

    app.get('/service', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    })

    app.get('/user', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })


    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin })
    })
    app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      const filter = { email: email };
      const updateDoc = {
        $set: { role: 'admin' },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);


    })

    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ result, token });
    })
    app.get('/available', async (req, res) => {
      const date = req.query.date;
      const services = await serviceCollection.find().toArray();
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();
      services.forEach(service => {
        const serviceBookings = bookings.filter(book => book.treatment === service.name);
        const bookedSlots = serviceBookings.map(book => book.slot)
        const available = service.slots.filter(slot => !bookedSlots.includes(slot));
        service.slots = available;
      })
      res.send(services);
    })

    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      }
      else {
        return res.send(403).send({ message: 'Forbidden access' });
      }

    })

    app.get('/booking/:id', async(req, res)=>{
      const id= req.params.id;
      const query= {_id: ObjectId(id)};
      const booking= await bookingCollection.findOne(query);
      res.send(booking);

    })
    app.patch('/booking/:id', async(req, res)=>{
      const id= req.params.id;
      const payment= req.body;
      const filter={_id: ObjectId(id)};
      const updateDoc={
        $set: {
          paid: true,
          transactionId: payment.transactionId
        }
      }
      const result= await paymentCollection.insertOne(payment);
      const updatedBooking= await bookingCollection.updateOne(filter, updateDoc)
      res.send(updateDoc);
    })

    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists })
      }
      const result = await bookingCollection.insertOne(booking);
      console.log('sending email');
      sendAppointmentEmail(booking);
      return res.send({ success: true, result });
    });

    app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    })

    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    })
    app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    })
  }
  finally {

  }
}
run().catch(console.dir)


app.get('/', (req, res) => {
  res.send('Doctors App running')
})

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`)
})