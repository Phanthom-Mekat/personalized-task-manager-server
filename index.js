
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

const port = process.env.PORT || 5000;



//middleware
app.use(express.json());
app.use(cors(
    {
        origin: ['http://localhost:5173'], //replace with client address
        credentials: true,
    }
)); 

// cookie parser middleware
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zhb6u.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const database = client.db("taskManager");
    const usersCollection = database.collection("users");


    app.post('/users', async (req, res) => {
        const user = req.body;

        const existingUser = await usersCollection.findOne({ email: user.email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'User already exists' 
            });
        }
    

        user.createdAt = new Date();
        user.updatedAt = new Date();

        const result = await usersCollection.insertOne(user);
        
        if (result.insertedId) {
            return res.status(201).json({
                success: true,
                message: 'User created successfully',
                user: {
                    uid: user.uid,
                    email: user.email,
                    name: user.name,
                    role: user.role
                }
            });
        }
    
        res.status(400).json({ 
            success: false, 
            message: 'Failed to create user' 
        });
    });


    app.get('/users/:email', async (req, res) => {
        const { email } = req.params;
        const user = await usersCollection.findOne(
            { email },
            { projection: { _id: 0, password: 0 } }
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
    
        res.json({
            success: true,
            user
        });
    });





    // Send a ping to confirm a successful connection



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Hello from my server')
})

app.listen(port, () => {
    console.log('My simple server is running at', port);
})
