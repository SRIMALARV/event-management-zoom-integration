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


app.post("/api/create-meeting", async (req, res) => {
  try {
    if (!accessToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const meetingData = {
      ...req.body,
      start_time: new Date(req.body.start_time).toISOString(), 
      type: 2, 
    };
    const meetingsResponse = await axios.post(
      "https://api.zoom.us/v2/users/me/meetings",
      meetingData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const { id, join_url, password } = meetingsResponse?.data;

    res.json({
      meeting_id: id,
      join_url: join_url,
      password: password,
    });
  } catch (error) {
    if (error.response?.status === 401) {
      console.log("Access token expired, refreshing...");
      return res.redirect("/api/create-meeting");
    }

    console.error("Error creating meeting:", error.response?.data || error.message);
  }
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

