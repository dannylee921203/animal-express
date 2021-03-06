import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import passport from 'passport';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt, { compareSync } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import myPassport from './passport';
import User from './model/user';
import Pet from './model/pet';
import Like from './model/like';
import Comment from './model/comment';


dotenv.config();
const app = express();
const PORT = process.env.PORT;
const path = require('path');
const multer  = require('multer')
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('./'));

// db
mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('DB connected successfully');
}).catch((err) => {
    console.log(err);
});

app.use(cors());
app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());
myPassport(passport);



app.post('/signup', async (req, res) => {
    const { email, password, username } = req.body;

    try {
        const user = await User.findOne({ email });
        if(user) {
            throw new Error('이미 등록된 유저입니다')
        }
        
        const newUser = new User({
            email,
            username,
            password
        });
        const salt = await bcrypt.genSalt(5);
        const hashed = await bcrypt.hash(password, salt);
        newUser.password = hashed;
        await newUser.save();

        const payload = {
            id: newUser._id,
            name: newUser.username
        }
        const token = await jwt.sign(payload, process.env.SECRET, { expiresIn: 3600 * 24 });

        res.json({
            ok: true,
            user: newUser,
            token: token,
        })
    } catch(err) {
        console.log(err);
        return res.status(400).json({
            ok: false,
            error: err.message
        })
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        console.log(user);
        if(!user) {
            throw new Error('등록되지 않은 정보입니다');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch) {
            throw new Error('패스워드가 맞지 않습니다');
        }

        const payload = {
            id: user._id,
            name: user.name
        }
        const token = await jwt.sign(payload, process.env.SECRET, { expiresIn: 3600 * 24 });

        res.json({
            ok: true,
            payload: user,
            username: user.name,
            token: token
        })
    } catch(err) {
        console.log(err);
        return res.status(400).json({
            ok: false,
            error: err.message
        })
    };
});

app.get('/logout', (req, res) => {
    req.logout();
    return res.json({
        ok: true,
        message: 'logout'
    })
});

app.get('/userdata/:id', passport.authenticate('jwt', { session: false }), async(req, res) => {

    try {
        const user = await User.findById(req.params.id);

        res.json({
            ok: true,
            payload: user,
        })
    } catch(err) {
        console.log(err);
        return res.status(400).json({
            ok: false,
            error: err.message
        })
    };
});
// app.put('/favorites', passport.authenticate('jwt', { session: false }), (req, res) => {

// });

// app.post('/like', passport.authenticate('jwt', { session: false }), (req, res) => {
//     const { like } = req.body;
//     Like.findOne({ user }).then(async like => {
//         try {
//             const newLike = new Like({
//                 like: true
//             });

//             await newLike.save();
//             res.json({
//                 ok: true,
//             })
//         } catch(err) {
//             console.log(err);
//             res.status(400).json({
//                 ok: false,
//                 error: err.message
//             })
//         }
//     })
// });

// app.delete('/like', passport.authenticate('jwt', { session: false }), (req, res) => {

// });

app.post('/comment', passport.authenticate('jwt', { session: false }), async (req, res) => {
    const { comment, petId, userId } = req.body;
    try {
        const newComment = new Comment({
            comment,
            pet: petId,
            owner: userId
        })
        newComment.save();

        const pet = await Pet.findById(petId);
        await pet.updateOne({comments: [...pet.comments, newComment._id]})
        res.json(await Comment.findOne({_id: newComment._id})).populate('owner');

    } catch (error) {
        console.log(error);
        return res.status(400).json({
            ok: false,
            error: error.message
        })
    }
})

app.get('/pet/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
    console.log(req.params.id);
    try {
        const pet = await Pet.findOne({ _id: req.params.id }).populate('owner').populate({path:'comments', populate: {path:'owner'}});
        res.json({pet});
    } catch (error) {
        console.log(error);
        return res.status(400).json({
            ok: false,
            error: error.message
        })
    }
});


const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, 'uploads/');
      },
      filename: (req, file, cb) => {
        cb(null, new Date().valueOf() + path.extname(file.originalname));
      },
    }),
  });

app.post('/pet/:id', upload.any('animal-img'), passport.authenticate('jwt', { session: false }), async (req, res) => {
    const favorites = [req.body.favorite1,req.body.favorite2, req.body.favorite3];
    console.log(favorites);
    try {
        const pet = await Pet.findOne({ _id: req.params.id });

        if(pet) {
            throw new Error('동일한 이름이 벌써 등록되어 있습니다');
        }

        const newPet = new Pet({
            name: req.body.petName,
            deathDate: req.body.deathDate,
            favorites: favorites,
            owner: req.params.id,
            image: 'http://localhost:8080/' + req.files[0].path
        })
        console.log(newPet);
        await newPet.save();
        console.log(newPet);
        res.json({
            ok: true,
            pet: newPet,
        })
    } catch (error) {
        console.log(error);
        res.status(400).json({
            ok: false,
            error: error.message
        })
    }
});

app.get('/pet/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
    console.log(req.params.id);
    try {
        const pet = await Pet.findOne({ _id: req.params.id }).populate('owner').populate({path:'comments', populate: {path:'owner'}});
        res.json({pet});
    } catch (error) {
        console.log(error);
        res.status(400).json({
            ok: false,
            error: error.message
        })
    }
});

app.get('/pets', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        const pets = await Pet.find({}).populate('owner').populate({path:'comments', populate: {path:'owner'}});
        if (!pets.length) throw new Error('등록된 동물이 없습니다');
        res.json({pets});
    } catch (error) {
        console.log(error);
        res.status(400).json({
            ok: false,
            error: error.message
        })
    }
});

app.listen(PORT, () => {
    console.log(`Server is started on ${PORT}`);
});