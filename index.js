const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
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

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const database = client.db("taskManager");
        const usersCollection = database.collection("users");
        const tasksCollection = database.collection("tasks");

        await tasksCollection.createIndex({ order: 1 });

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
    
    

        // POST - Create new task
        app.post('/tasks', async (req, res) => {
            try {
                const { title, description, category, userId } = req.body;
                
                if (!title) {
                    return res.status(400).json({ error: 'Title is required' });
                }
                if (!userId) {
                    return res.status(400).json({ error: 'User ID is required' });
                }
                
                const validCategories = ['To-Do', 'In Progress', 'Done'];
                const finalCategory = category || 'To-Do';
                
                if (!validCategories.includes(finalCategory)) {
                    return res.status(400).json({ error: 'Invalid category' });
                }
                
                const highestOrder = await tasksCollection
                    .find({ category: finalCategory, userId })
                    .sort({ order: -1 })
                    .limit(1)
                    .toArray();
                
                const order = highestOrder.length > 0 ? highestOrder[0].order + 1 : 0;
        
                const task = {
                    title,
                    description: description || '',
                    category: finalCategory,
                    userId,
                    timestamp: new Date(),
                    order,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
        
                const result = await tasksCollection.insertOne(task);
                
                if (!result.insertedId) {
                    throw new Error('Failed to insert task');
                }
                
                const newTask = await tasksCollection.findOne({ _id: result.insertedId });
                
                res.status(201).json(newTask);
            } catch (error) {
                console.error('Error creating task:', error);
                res.status(500).json({ error: error.message || 'Internal server error' });
            }
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
            res.json(updatedTask);
        });

        // PUT - Reorder tasks
        app.put('/tasks/reorder/:userId', async (req, res) => {
            const { userId } = req.params;
            const { tasks } = req.body;
            
            try {
                const operations = tasks.map((task) => ({
                    updateOne: {
                        filter: { _id: new ObjectId(task._id) },
                        update: { 
                            $set: { 
                                order: task.order, 
                                category: task.category 
                            }
                        }
                    }
                }));
            
                const result = await tasksCollection.bulkWrite(operations);
            
                if (result.modifiedCount > 0) {
                    res.json({ success: true });
                } else {
                    res.status(400).json({ 
                        success: false, 
                        error: 'No tasks were updated' 
                    });
                }
            } catch (error) {
                console.error('Error in reorder operation:', error);
                res.status(500).json({ 
                    success: false, 
                    error: 'Failed to reorder tasks' 
                });
            }
        });

        // DELETE - Remove task
        app.delete('/tasks/:id', async (req, res) => {
            const { id } = req.params;
            await tasksCollection.deleteOne({ _id: new ObjectId(id) });
            res.json({ success: true });
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from my server')
})

app.listen(port, () => {
    console.log('Server is running at', port);
})