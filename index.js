const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { Server } = require('socket.io');
const http = require('http');
const app = express();
const server = http.createServer(app); //  HTTP server
const io = new Server(server, {      // Initialize Socket.IO
    cors: {
        origin: ['http://localhost:5173'], //   CORS settings
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

const port = process.env.PORT || 5000;

//middleware
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
})); 

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
    const tasksCollection = database.collection("tasks");



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



    await tasksCollection.createIndex({ order: 1 });

    io.on('connection', (socket) => {
        console.log('Client connected');
        
        socket.on('taskUpdated', async (data) => {
            io.emit('taskChange', data);
        });
    });

            // POST - Create new task
            app.post('/tasks', async (req, res) => {
                const { title, description, category, userId } = req.body;
                
                // Get highest order in the category
                const highestOrder = await tasksCollection
                    .find({ category, userId })
                    .sort({ order: -1 })
                    .limit(1)
                    .toArray();
                
                const order = highestOrder.length > 0 ? highestOrder[0].order + 1 : 0;
    
                const task = {
                    title,
                    description,
                    category,
                    userId,
                    timestamp: new Date(),
                    order
                };
    
                const result = await tasksCollection.insertOne(task);
                const newTask = await tasksCollection.findOne({ _id: result.insertedId });
                
                io.emit('taskChange', { type: 'create', task: newTask });
                res.status(201).json(newTask);
            });
    
            // GET - Retrieve all tasks for a user
            app.get('/tasks/:userId', async (req, res) => {
                const { userId } = req.params;
                const tasks = await tasksCollection
                    .find({ userId })
                    .sort({ order: 1 })
                    .toArray();
                res.json(tasks);
            });
    
            // PUT - Update task
            app.put('/tasks/:id', async (req, res) => {
                const { id } = req.params;
                const { title, description, category, order } = req.body;
                
                const update = {
                    $set: {
                        ...(title && { title }),
                        ...(description && { description }),
                        ...(category && { category }),
                        ...(order !== undefined && { order }),
                        updatedAt: new Date()
                    }
                };
    
                await tasksCollection.updateOne(
                    { _id: new ObjectId(id) },
                    update
                );
    
                const updatedTask = await tasksCollection.findOne({ _id: new ObjectId(id) });
                io.emit('taskChange', { type: 'update', task: updatedTask });
                res.json(updatedTask);
            });
    
            // PUT - Reorder tasks
            app.put('/tasks/reorder/:userId', async (req, res) => {
                const { userId } = req.params;
                const { tasks } = req.body;
                
                const operations = tasks.map((task) => ({
                    updateOne: {
                        filter: { _id: new ObjectId(task._id) },
                        update: { $set: { order: task.order, category: task.category } }
                    }
                }));
    
                await tasksCollection.bulkWrite(operations);
                io.emit('taskChange', { type: 'reorder', tasks });
                res.json({ success: true });
            });
    
            // DELETE - Remove task
            app.delete('/tasks/:id', async (req, res) => {
                const { id } = req.params;
                await tasksCollection.deleteOne({ _id: new ObjectId(id) });
                io.emit('taskChange', { type: 'delete', taskId: id });
                res.json({ success: true });
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

server.listen(port, () => {
    console.log('My simple server is running at', port);
})
