const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ni67c.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
// console.log("url",uri);

client.connect(() => {
    console.log('connected');
})



//  JSON WEB TOKEN

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
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


async function run() {
    try {
        await client.connect();

        // ALL COLLECTIONS
        const productCollection = client.db('nano_counting').collection('products');
        const userCollection = client.db('nano_counting').collection('users');
        const purchaseCollection = client.db('nano_counting').collection('purchases')
        const paymentCollection = client.db('nano_counting').collection('payments');


        // Check Admin
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }


        // Check Owner
        const verifyOwner = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'owner') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }


        // Making Payment
        // jwt here
        // app.post("/create-payment-intent",  async (req, res) => {
        //     const product = req.body;
        //     const price = product.buyerPrice;
        //     const amount = price * 100;
        //     const paymentIntent = await stripe.paymentIntents.create({
        //         amount: amount,
        //         currency: "usd",
        //         payment_method_types: ["card"],
        //     });

        //     res.send({
        //         clientSecret: paymentIntent.client_secret,
        //     });
        // });
        app.post("/create-payment-intent", async (req, res) => {
            const product = req.body;
            // fix this price
            const price = 100;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // Update Payment status
        app.patch('/payment/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    pending: true,
                    transactionId: payment.transactionId
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedPurchases = await purchaseCollection.updateOne(filter, updatedDoc);
            res.send(updatedPurchases);
        })

        // Updating Payment status in the UI
        app.put('/pending/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    pending: false
                }
            }
            const result = await purchaseCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        // Getting data for payment 
        app.get("/payment/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const purchase = await purchaseCollection.findOne(query);
            res.send(purchase)
        })


        // getting 6 products data

        app.get('/products/home', async (req, res) => {
            const query = {};
            const limit = 6;
            const cursor = productCollection.find(query).limit(limit);
            const product = await cursor.toArray();
            res.send(product);
        }
        )

        // Getting all products to show in products page
        app.get('/products', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const product = await cursor.toArray();
            res.send(product);
        });

        // Adding new tool in UI and database
        // add jwt here
        // add verifyAdmin, here
        app.post('/products', async (req, res) => {
            const product = req.body;
            const result = await productCollection.insertOne(product);
            res.send(result);
        });

        // add jwt here
        // add verifyAdmin, here
        app.delete("/products/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await productCollection.deleteOne(filter);
            res.send(result)
        })

        // Getting purchase orders to show in manage order
        app.get('/purchase', async (req, res) => {
            const purchase = await purchaseCollection.find().toArray();
            res.send(purchase);
        });

        // get data for purchasing
        app.get("/purchase/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await productCollection.findOne(filter);
            res.send(result)
        })


        // getting user
        app.get('/user', async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        // Updating My profile in Dashboard
        app.post("/myProfile/:email", async (req, res) => {
            const email = req.params.email;
            const changes = req.body
            const filter = { email: email }
            const options = { upsert: true }
            const updatedDoc = {
                $set: changes
            }
            const updatedUser = await userCollection.updateOne(filter, updatedDoc, options);
            res.send(updatedUser)
        })

        // Getting data for my profile
        app.get("/user/:email",  async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await userCollection.findOne(query);
            res.send(result)
        })

        // Use Token DONT ADD JWT HERE
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };

            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token });
        })

        // Making an Order

        // JWT here
        app.post("/purchase", async (req, res) => {
            const purchase = req.body;
            const result = await purchaseCollection.insertOne(purchase);
            return res.send({ success: true, result: result })
        })

        //  My order delete
        // jwt here
        app.delete("/purchase/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await purchaseCollection.deleteOne(filter);
            res.send(result)
        })

        // Getting my order
        app.get('/myOrder', async (req, res) => {
            const email = req.query.email;
            const query = { buyerEmail: email };
            const tool = await purchaseCollection.find(query).toArray();
            res.send(tool);
        })

        // // Use Token DONT ADD JWT HERE
        // app.put('/user/:email', async (req, res) => {
        //     const email = req.params.email;
        //     const user = req.body;
        //     const filter = { email: email };
        //     const options = { upsert: true };

        //     const updateDoc = {
        //         $set: user,
        //     };
        //     const result = await userCollection.updateOne(filter, updateDoc, options);
        //     const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
        //     res.send({ result, token });
        // })

        // Making admin
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);

        })

        // Making accoutant
        app.put('/user/accountant/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'accountant' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);

        })

        // use admin hook
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // use accountant hook
        app.get('/accountant/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAccountant = user.role === 'accountant';
            res.send({ accountant: isAccountant })
        })

        // use owner hook
        app.get('/owner/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isOwner = user.role === 'owner';
            res.send({ owner: isOwner })
        })

        app.get("/reciept/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const purchase = await purchaseCollection.findOne(query);
            res.send(purchase)
        })

        app.get('/sop', async (req, res) => {
            const query = {};
            const cursor = purchaseCollection.find(query);
            const purchase = await cursor.toArray();
            res.send(purchase);
        });
        

    }

    finally {

    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello From nanocounting!')
})

app.listen(port, () => {
    console.log(`nanocounting listening on port ${port}`)
})