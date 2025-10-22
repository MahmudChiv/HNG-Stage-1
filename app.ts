import express from "express";
import myRoutes from "./routes/myRoutes"

const app = express();
const PORT = 3000;

app.use(express.json());
app.use("/", myRoutes)

app.get("/", (req, res) => {
  res.send("API live");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
