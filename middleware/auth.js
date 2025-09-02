import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
  try {
    // Get the authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization;

    // Check if Authorization header exists and has correct format
    if (!authHeader) {
      console.log("Auth failed: No authorization header");
      return res.status(401).json({ message: "Authorization header missing" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      console.log("Auth failed: Invalid token format (no Bearer prefix)");
      return res.status(401).json({ message: "Invalid token format" });
    }

    // Extract the token
    const token = authHeader.split(" ")[1];

    if (!token) {
      console.log("Auth failed: Token is empty");
      return res.status(401).json({ message: "Token is empty" });
    }

    // Verify the token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user id to request for routes
      req.user = { id: decoded.id };
      next();
    } catch (jwtError) {
      console.log("JWT verification error:", jwtError.message);

      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired" });
      } else if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid token" });
      } else {
        return res.status(401).json({ message: "Token verification failed" });
      }
    }
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res
      .status(500)
      .json({ message: "Server error during authentication" });
  }
};

export default auth;
