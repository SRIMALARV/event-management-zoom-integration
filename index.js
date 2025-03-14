const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

const apiKey = process.env.ZOOM_MEETING_CLIENT_ID;
const apiSecret = process.env.ZOOM_MEETING_CLIENT_SECRET;
const redirect_uri = "http://localhost:3000/api/callback";

let accessToken = process.env.ACCESS_TOKEN;
let refreshToken = process.env.REFRESH_ACCESS_TOKEN;
app.get("/api/zoom-auth", (req, res) => {
  const authorizationUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${apiKey}&redirect_uri=${redirect_uri}`;
  return res.redirect(encodeURI(authorizationUrl));
});

app.get("/api/callback", async (req, res) => {
  const authorizationCode = req.query.code;

  try {
    const tokenResponse = await axios.post(
      "https://zoom.us/oauth/token",
      null,
      {
        params: {
          grant_type: "authorization_code",
          code: authorizationCode,
          redirect_uri: redirect_uri,
        },
        auth: {
          username: apiKey,
          password: apiSecret,
        },
      }
    );

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    console.log("New Access Token:", accessToken);
    console.log("Refresh Token:", refreshToken);

    res.json({ access_token: accessToken, refresh_token: refreshToken });
  } catch (e) {
    console.error("Error getting tokens:", e.response.data);
    res.status(500).send("Error getting tokens");
  }
});

const crypto = require('crypto');

app.post("/api/generate-signature", (req, res) => {
  const { meetingNumber, role } = req.body;

  if (!meetingNumber || role === undefined) {
    return res.status(400).json({ error: "Missing meetingNumber or role" });
  }

  try {
    const timestamp = new Date().getTime() - 30000;
    const msg = Buffer.from(`${apiKey}${meetingNumber}${timestamp}${role}`).toString("base64");
    const hash = crypto.createHmac("sha256", apiSecret).update(msg).digest("base64");
    const signature = Buffer.from(`${apiKey}.${meetingNumber}.${timestamp}.${role}.${hash}`).toString("base64");

    res.json({ signature });
  } catch (error) {
    console.error("Error generating signature:", error);
    res.status(500).json({ error: "Signature generation failed" });
  }
});

const refreshAccessToken = async () => {
  try {
    const response = await axios.post(
      "https://zoom.us/oauth/token",
      null,
      {
        params: {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        },
        auth: {
          username: apiKey,
          password: apiSecret,
        },
      }
    );

    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;

    console.log("New Access Token:", accessToken);
    console.log("New Refresh Token:", refreshToken);

    return accessToken;
  } catch (error) {
    console.error("Error refreshing access token:", error.response?.data || error.message);
    return null;
  }
};


app.post("/api/create-meeting", async (req, res) => {
  try {
    if (!accessToken) {
      return res.status(401).json({ error: "Unauthorized: Missing Access Token" });
    }

    const meetingData = {
      ...req.body,
      start_time: req.body.start_time,
      timezone: req.body.timezone || "UTC",
      type: 2,
    };

    let meetingsResponse = await axios.post(
      "https://api.zoom.us/v2/users/me/meetings",
      meetingData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const { id, join_url, password } = meetingsResponse.data;

    res.json({
      meeting_id: id,
      join_url: join_url,
      password: password,
    });
  } catch (error) {
    if (error.response?.status === 401) {
      console.log("Access token expired, refreshing...");

      const newAccessToken = await refreshAccessToken();

      if (!newAccessToken) {
        return res.status(401).json({ error: "Unauthorized: Failed to refresh token" });
      }

      try {
        const meetingsResponse = await axios.post(
          "https://api.zoom.us/v2/users/me/meetings",
          req.body,
          {
            headers: {
              Authorization: `Bearer ${newAccessToken}`,
            },
          }
        );

        const { id, join_url, password } = meetingsResponse.data;
        return res.json({
          meeting_id: id,
          join_url: join_url,
          password: password,
        });
      } catch (retryError) {
        return res.status(500).json({ error: "Failed to create meeting after refreshing token" });
      }
    }
    return res.status(500).json({ error: "Failed to create meeting" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

//https://marketplace.zoom.us/authorize?client_id=6SD9j_31RIm1UZaUKBKgQ&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fcallback&_zmp_login_state=DmueIYG3TNygwex3JD4i1A