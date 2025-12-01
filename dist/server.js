import express from "express";
import cors from "cors";
import claimsRouter from "./Routes/claims.js";
import dimensionsRouter from "./Routes/demensions.js";
import { connectDB } from "./DB/Connection.js";
const PORT = process.env.PORT || 5050;
const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
    res.json({ message: "Remit backend is running perfectly on Azure!", time: new Date().toISOString() });
});
(async () => {
    await connectDB();
    app.use("/claims", claimsRouter);
    app.use("/dimensions", dimensionsRouter); // New route
    app.listen(PORT, () => console.log("API running on http://localhost:5050"));
})();
