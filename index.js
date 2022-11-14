const express = require('express')
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.otausu5.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try{
        await client.connect();
        const serviceCollection=client.db('doctors_portal').collection('services');
        const bookingCollection=client.db('doctors_portal').collection('bookings');
        const userCollection=client.db('doctors_portal').collection('users');
        app.get('/service', async(req, res)=>{
            const query={};
            const cursor= serviceCollection.find(query);
            const services= await cursor.toArray();
            res.send(services);
        })

        app.put('/user/:email', async(req, res)=>{
          const email=req.params.email;
          const user= req.body;
          const filter= {email: email};
          const options= {upsert:true};
          const updateDoc = {
            $set: user,
          };
          const result= await userCollection.updateOne(filter, updateDoc, options);
          res.send(result);
        })
        app.get('/available', async(req, res)=>{
          const date= req.query.date ;
          const services= await serviceCollection.find().toArray();
          const query={date:date};
          const bookings= await bookingCollection.find(query).toArray();
          services.forEach(service=>{
            const serviceBookings= bookings.filter(book=> book.treatment===service.name);
            const bookedSlots= serviceBookings.map(book=> book.slot)
            const available= service.slots.filter(slot=> !bookedSlots.includes(slot));
            service.slots= available;
          })
          res.send(services);
        })

        app.get('/booking', async(req, res)=>{
          const patient= req.query.patient;
          const query= {patient:patient} ;
          const bookings= await bookingCollection.find(query).toArray();
          res.send(bookings);
        })

        app.post('/booking', async(req,res)=>{
          const booking= req.body;
          const query={treatment: booking.treatment, date:booking.date, patient: booking.patient}
          const exists= await bookingCollection.findOne(query);
          if(exists){
            return res.send({success: false, booking: exists})
          }
          const result= await bookingCollection.insertOne(booking);
          return res.send({success: true, result});
        })
    }
    finally{

    }
}
run().catch(console.dir)


app.get('/', (req, res) => {
  res.send('Doctors App running')
})

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`)
})