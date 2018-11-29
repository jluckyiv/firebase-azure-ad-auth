/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const functions = require('firebase-functions');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Firebase Setup
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`,
});

const OAUTH_REDIRECT_URI = `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/auth.html`;
const OAUTH_SCOPES = 'openid profile email User.Read';

/**
 * Creates a configured simple-oauth2 client for Azure.
 */
function azureOAuth2Client() {
  // Azure OAuth 2 setup
  // TODO: Configure the `azure.client_id`, `azure.client_secret`,
  // and `azure.tenant_id`Google Cloud environment variables.

  // If there is no tenant_id environmet variable, use the common enpoint.
  const tenantId = functions.config().azure.tenant_id || "common";

  const credentials = {
    client: {
      id: functions.config().azure.client_id,
      secret: functions.config().azure.client_secret,
    },
    auth: {
      tokenHost: 'https://login.microsoftonline.com',
      authorizePath: `${tenantId}/oauth2/v2.0/authorize`,
      tokenPath: `${tenantId}/oauth2/v2.0/token`,
    },
  };
  return require('simple-oauth2').create(credentials);
}

/**
 * Redirects the User to the Azure authentication consent screen. Also the 'state' cookie is set for later state
 * verification.
 */
exports.redirect = functions.https.onRequest((req, res) => {
  const oauth2 = azureOAuth2Client();

  cookieParser()(req, res, () => {
    const state = req.cookies.state || crypto.randomBytes(20).toString('hex');
    console.log('Setting verification state:', state);
    res.cookie('state', state.toString(), {
      maxAge: 3600000,
      secure: true,
      httpOnly: true,
    });
    const redirectUri = oauth2.authorizationCode.authorizeURL({
      redirect_uri: OAUTH_REDIRECT_URI,
      scope: OAUTH_SCOPES,
      state: state,
    });
    console.log('Redirecting to:', redirectUri);
    res.redirect(redirectUri);
  });
});

/**
 * Exchanges a given Azure auth code passed in the 'code' URL query parameter for a Firebase auth token.
 * The request also needs to specify a 'state' query parameter which will be checked against the 'state' cookie.
 * The Firebase custom auth token, display name, photo URL and Azure acces token are sent back in a JSONP callback
 * function with function name defined by the 'callback' query parameter.
 */
exports.token = functions.https.onRequest(async (req, res) => {
  const oauth2 = azureOAuth2Client();

  try {
    return cookieParser()(req, res, async () => {
      console.log('Received verification state:', req.cookies.state);
      console.log('Received state:', req.query.state);
      if (!req.cookies.state) {
        throw new Error('State cookie not set or expired. Maybe you took too long to authorize. Please try again.');
      } else if (req.cookies.state !== req.query.state) {
        throw new Error('State validation failed');
      }

      const auth_code = req.query.code;
      console.log('Received auth code:', auth_code);

      const result = await oauth2.authorizationCode.getToken({
        code: auth_code,
        redirect_uri: OAUTH_REDIRECT_URI,
        scope: OAUTH_SCOPES,
      });
      console.log('Auth code exchange result received:', result);

      // We have an Azure access token and the user identity now.

      const token = oauth2.accessToken.create(result);
      console.log('Token created: ', token.token);

      const accessToken = token.token.access_token;
      const user = jwt.decode(token.token.id_token);
      const userId = user.oid;
      const userName = user.name;
      const email = user.email;

      // Create a Firebase account and get the Custom Auth Token.
      const firebaseToken = await createFirebaseAccount(userId, userName, email, accessToken);
      // Serve an HTML page that signs the user in and updates the user profile.
      return res.jsonp({ token: firebaseToken});
    });
  } catch(error) {
    return res.jsonp({
      error: error.toString(),
    });
  }
});

/**
 * Creates a Firebase account with the given user profile and returns a custom auth token allowing
 * signing-in this account.
 * Also saves the accessToken to the datastore at /azureAccessToken/$uid
 *
 * @returns {Promise<string>} The Firebase custom auth token in a promise.
 */
async function createFirebaseAccount(userId, displayName, email, accessToken) {
  // The UID we'll assign to the user.
  const uid = `azure-ad:${userId}`;

  // Save the access token to the Firebase Realtime Database.
  const databaseTask = admin.database().ref(`/azureAccessToken/${uid}`).set(accessToken);

  // Create or update the user account.
  const userCreationTask = admin.auth().updateUser(uid, {
    displayName: displayName,
  }).catch((error) => {
    // If user does not exists we create it.
    if (error.code === 'auth/user-not-found') {
      return admin.auth().createUser({
        uid: uid,
        displayName: displayName,
        email: email,
        emailVerified: true,
      });
    }
    throw error;
  });

  // Wait for all async task to complete then generate and return a custom auth token.
  await Promise.all([userCreationTask, databaseTask]);
  // Create a Firebase custom auth token.
  const token = await admin.auth().createCustomToken(uid);
  console.log(`Created Custom token for UID "${uid}" Token: ${token}`);
  return token;
}
