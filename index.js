import express from "express";
import fs from "fs";
import bodyParser from "body-parser";
import { createServer } from "http";
import { Server } from "socket.io";

const port = 3000;
const app = express();
const server = createServer(app);
const io = new Server(server);

var userlist = [];
var passlist = [];
var countlist = [];

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

// Load users from info.txt on startup
fs.readFile("info.txt", "utf-8", (err, data) => {
    if (err) {
        console.log("info.txt not found or empty");
        return;
    }
    var lines = data.trim().split("\n");
    for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].trim().split("|");
        if (parts.length > 2) {
            var count = parts[0];
            var user = parts[1];
            var pass = parts[2];
            userlist.push(user.trim());
            passlist.push(pass.trim());
            countlist.push(count.trim());
        }
    }
});

app.set("view engine", "ejs");

app.get("/", (req, res) => {
    res.render("index.ejs", { code: "signup", note: null });
});

app.post("/signup", (req, res) => {
    var user = req.body.username;
    var pass = req.body.password;
    var num = countlist.length;

    if (userlist.includes(user)) {
        return res.render("index.ejs", { code: "signup", note: "Username already exists" });
    }

    fs.appendFile("info.txt", num + "|" + user + "|" + pass + "\n", (err) => {
        if (err) throw err;
        userlist.push(user);
        passlist.push(pass);
        countlist.push(num);

        io.emit("newUser", user);

        console.log("saved successfully");
        res.render("home.ejs", { code: user, users: userlist });
    });
});

app.get("/login", (req, res) => {
    res.render("index.ejs", { code: "login", note: null });
});

app.post("/login", (req, res) => {
    var user = req.body.username;
    var pass = req.body.password;

    const idx = userlist.indexOf(user);
    if (idx === -1) {
        return res.render("index.ejs", { code: "login", note: "Username not found" });
    }
    if (pass !== passlist[idx]) {
        return res.render("index.ejs", { code: "login", note: "Incorrect password!" });
    }
    res.render("home.ejs", { code: user, users: userlist });
});

app.get("/home", (req, res) => {
    var user = req.query.user;

    if (!user || !userlist.includes(user)) {
        return res.redirect("/");
    }
    res.render("home.ejs", { code: user, users: userlist });
});

app.get("/chat/:id", (req, res) => {
    const user1 = req.query.user;
    const user2 = req.params.id;

    if (!user1 || !userlist.includes(user1)) {
        return res.redirect("/");
    }

    const sortarr = [user1, user2].sort();
    const filename = sortarr[0] + "_" + sortarr[1] + ".txt";

    fs.readFile(filename, "utf-8", (err, data) => {
        if (err) {
            // Create empty chat file if not exists
            fs.writeFile(filename, "", (err) => {
                if (err) throw err;
                console.log("chat created successfully");
                return res.render("chats.ejs", { user1, user2, chats: [] });
            });
        } else {
            let chatlist = data.trim().split("|").filter(Boolean);
            res.render("chats.ejs", { user1, user2, chats: chatlist });
        }
    });
});

// Post new chat message with correct new index
app.post("/chat/:id", (req, res) => {
    const msg = req.body.msg;
    const user1 = req.query.user;
    const user2 = req.params.id;
    const sortarr = [user1, user2].sort();
    const room = sortarr[0] + "_" + sortarr[1];

    fs.readFile(room + ".txt", "utf8", (err, data) => {
        let messages = [];
        if (!err && data.trim() !== "") {
            messages = data.trim().split("|").filter(Boolean);
        }
        const newIndex = messages.length;
        const fullMsg = newIndex + "`" + user1 + ": " + msg + "|";

        fs.appendFile(room + ".txt", fullMsg, (err) => {
            if (err) throw err;
            console.log("saved successfully");

            io.to(room).emit("message", {
                sender: user1,
                message: msg,
                index: newIndex,
            });

            res.redirect("/chat/" + user2 + "?user=" + user1);
        });
    });
});

// Delete message by index, re-index others
app.get("/dlt/:id", (req, res) => {
    const user2 = req.params.id;
    const user1 = req.query.user;
    const delIndex = req.query.j;
    const sortarr = [user1, user2].sort();
    const room = sortarr[0] + "_" + sortarr[1];

    fs.readFile(room + ".txt", "utf8", (err, data) => {
        if (err) throw err;

        const lines = data.split("|").filter(Boolean);
        let newData = "";
        let count = 0;
        for (let line of lines) {
            const [index, content] = line.split("`");
            if (index !== delIndex) {
                newData += count + "`" + content + "|";
                count++;
            }
        }
        fs.writeFile(room + ".txt", newData, (err) => {
            if (err) throw err;
            console.log("deleted successfully");
            res.redirect("/chat/" + user2 + "?user=" + user1);
        });
    });
});

// Render edit page with message content by index
app.get("/edit/:id", (req, res) => {
    const user1 = req.query.user;
    const user2 = req.params.id;
    const editIndex = req.query.j;
    const sortarr = [user1, user2].sort();
    const room = sortarr[0] + "_" + sortarr[1];

    fs.readFile(room + ".txt", "utf8", (err, data) => {
        if (err) throw err;
        const lines = data.split("|").filter(Boolean);
        let existingdata = "";
        for (let line of lines) {
            const [index, content] = line.split("`");
            if (index === editIndex) {
                existingdata = content;
                break;
            }
        }
        res.render("edit.ejs", { j: editIndex, content: existingdata, user1, user2 });
    });
});

// Update message content by index, re-index all
app.post("/edit/:id", (req, res) => {
    const user1 = req.query.user;
    const user2 = req.params.id;
    const editIndex = req.query.j;
    const updatedMsg = req.body.msg;
    const sortarr = [user1, user2].sort();
    const room = sortarr[0] + "_" + sortarr[1];

    fs.readFile(room + ".txt", "utf8", (err, data) => {
        if (err) throw err;
        const lines = data.split("|").filter(Boolean);
        let newData = "";
        for (let i = 0; i < lines.length; i++) {
            const [index, content] = lines[i].split("`");
            if (index === editIndex) {
                newData += i + "`" + user1 + ": " + updatedMsg + "|";
            } else {
                newData += i + "`" + content + "|";
            }
        }
        fs.writeFile(room + ".txt", newData, (err) => {
            if (err) throw err;
            console.log("edited successfully");
            res.redirect("/chat/" + user2 + "?user=" + user1);
        });
    });
});

// Socket.IO logic
io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("joinRoom", (roomName) => {
        socket.join(roomName);
        console.log("User joined room:", roomName);
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

app.get("/logout", (req, res) => {
    res.redirect("/");
});

server.listen(port, () => {
    console.log("server running on port " + port);
});
