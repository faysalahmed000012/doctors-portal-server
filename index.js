const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorize access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@cluster0.88dgu.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
async function run() {
  await client.connect();
  const servicesCollectioni = client
    .db("doctors-portal")
    .collection("services");
  const bookingCollection = client.db("doctors-portal").collection("booking");
  const userCollection = client.db("doctors-portal").collection("users");

  app.get("/services", async (req, res) => {
    const query = {};
    const cursor = servicesCollectioni.find(query);
    const result = await cursor.toArray();
    res.send(result);
  });

  app.get("/booking", verifyJWT, async (req, res) => {
    const patient = req.query.patient;
    const decodedEmail = req.decoded.email;
    if (patient === decodedEmail) {
      const query = { patient: patient };
      const bookings = await bookingCollection.find(query).toArray();
      return res.send(bookings);
    } else {
      return res.status(403).send({ message: "forbidden access" });
    }
  });
  app.get("/users", verifyJWT, async (req, res) => {
    const users = await userCollection.find().toArray();
    res.send(users);
  });

  app.get("/admin/:email", async (req, res) => {
    const email = req.params.email;
    const user = await userCollection.findOne({ email: email });
    const isAdmin = user?.role === "admin";
    res.send({ admin: isAdmin });
  });

  app.put("/users/admin/:email", verifyJWT, async (req, res) => {
    const email = req.params.email;
    const register = req.decoded.email;
    const requesterAccount = await userCollection.findOne({ email: register });
    if (requesterAccount.role === "admin") {
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);

      return res.send(result);
    } else {
      return res.status(403).send({ message: "forbidden access" });
    }
  });

  app.put("/users/:email", async (req, res) => {
    const email = req.params.email;
    const user = req.body;
    const filter = { email: email };
    const options = { upsert: true };
    const updateDoc = {
      $set: user,
    };
    const result = await userCollection.updateOne(filter, updateDoc, options);
    const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
      expiresIn: "1d",
    });
    res.send({ result, token });
  });

  app.post("/booking", async (req, res) => {
    const booking = req.body;
    const query = {
      treatment: booking.treatment,
      date: booking.date,
      patient: booking.patient,
    };
    const exists = await bookingCollection.findOne(query);
    if (exists) {
      return res.send({ success: false, booking: exists, query: query });
    } else {
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    }
  });

  app.get("/available", async (req, res) => {
    const date = req.query.date || "May 14, 2022";

    // step 1 : get all services

    const services = await servicesCollectioni.find().toArray();

    // step 2 : get the booking of that day
    const query = { date: date };
    const bookings = await bookingCollection.find(query).toArray();

    //step 3 : for each service, find booking of that service

    services.forEach((service) => {
      // step 4: find bookings for that service. output: [{}, {}, {}, {}]
      const serviceBooking = bookings.filter(
        (b) => b.treatment === service.name
      );
      // step 5: select slots for the service Bookings: ['', '', '', '']
      const booked = serviceBooking.map((s) => s.slot);
      // step 6: select those slots that are not in bookedSlots
      const available = service.slots.filter((s) => !booked.includes(s));
      //step 7: set available to slots to make it easier
      service.slots = available;

      // service.booked = serviceBooking.map(s => s.slot)
    });

    res.send(services);
  });
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Doctor!");
});

app.listen(port, () => {
  console.log(`Doctor is listening on port ${port}`);
});
