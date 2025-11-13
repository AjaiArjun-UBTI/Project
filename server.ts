import express from "express"
import cors from "cors"
import claimsRouter from "./Routes/claims"
import { connectDB } from "./DB/Connection";


const PORT = process.env.PORT || 5050
const app = express()

app.use(cors())
app.use(express.json());

(async () => {
  await connectDB();           // <-- ONE TIME connection
  app.use("/claims", claimsRouter);
  app.listen(PORT, () => console.log("API running on http://localhost:5050"));
})();
