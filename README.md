# Use Azure AD Sign In with Firebase

This sample shows how to authenticate Firebase apps using Azure AD Sign-In. It's copied from from [Firebase's function-samples repo](https://github.com/firebase/functions-samples/tree/master), specifically the [instagram-auth](https://github.com/firebase/functions-samples/tree/master/instagram-auth) sample. This model uses redirect instead of popup to be a little more mobile-friendly.

In this sample we use OAuth 2.0 based authentication to get Azure AD user information then create a Firebase Custom Token (using the `oid` from the Azure AD `id_token`).

## Setup the sample

Create and setup the Firebase project:

1. Create a Firebase project using the [Firebase Developer Console](https://console.firebase.google.com).
1. Enable Billing on your Firebase project by switching to the **Blaze** plan. You must upgrade to execute external HTTP requests from Cloud Functions.

Create and provide Service Account credentials:

1. Create a Service Accounts file as described in the [Server SDK setup instructions](https://firebase.google.com/docs/server/setup#add_firebase_to_your_app).
1. Save the Service Account credential file as `./functions/service-account.json`
1. Make sure `service-account.json` is in `.gitignore`.

Create and set up your Azure AD app:

1. Register an Azure AD app on [Azure Portal App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredAppsPreview). You'll need to do a **New registration** if you don't already have an app.
1. Once your app is created make sure you specify your app's callback URL in the list of **Redirect URIs** for your Azure AD app. You should whitelist `https://localhost:5000/auth.html` for local development and if you deploy on App Engine (See Deploy section below) you should whitelist the URL `https://<application-id>.firebaseapp.com/auth.html`. You can find your **Application (client) ID** in the Overview of the App Registration page. Use the appropriate `azure.redirect_uri` in your Firebase config. (See below.)
1. Under **Certificates & secrets**, generate a new client secret. Save this to your Firebase config under `azure.client_secret`.
1. Copy the **Application (client) ID** and **Directory (tenant) ID** from the overview page. **Password** of your Azure AD app and save these to your Firebase config as `azure.client_id` and `azure.tenant_id`. (See below.)

## Set your config

```bash
firebase functions:config:set azure.client_id="your application/client id" azure.client_secret="your client secret" azure.tenant_id="your directory/tenant id"
firebase functions:config:set azure.redirect_uri="local or app engine redirect uri"
```

> Make sure the Azure AD Password is always kept secret. For instance do not save it in your version control system.

## Deploy your project

1. Run `firebase init` and walk through the init process. It will also install your dependencies.
1. Run `npm i` or `yarn` to install dependencies if you didn't do it during the `init` process.
1. Run `firebase deploy` to deploy. The first time the Functions are deployed the process can take several minutes.

## Run the sample

Open the sample's website by using `firebase open hosting:site` or directly accessing `https://<project-id>.firebaseapp.com/`.

Click on the **Sign in with Azure AD** button and the page should redirect to the Microsoft auth page. Sign in and/or authorize the authentication request.

The website should display your name and email address from Azure AD. At this point you are authenticated in Firebase and can use the database/hosting etc...

## Workflow and design

When clicking the **Sign in with Azure AD** button the page redirects users to the `redirect` Function URL.

The `redirect` Function then redirects the user to the Azure AD OAuth 2.0 consent screen where the (first-time) user must grant approval. Also the `state` cookie is set on the client with the value of the `state` URL query parameter to check against later on.

After the user has granted approval the user is redirected back to the `./auth.html` page along with an OAuth 2.0 Auth Code as a URL parameter. This Auth code is then sent to the `token` Function using a JSONP Request. The `token` function then:

- Checks that the value of the `state` URL query parameter is the same as the one in the `state` cookie.
- Exchanges the auth code for an access token using the Azure AD app credentials and gets the user identity (oid, email, and full name).
- Mints a Custom Auth token (which is why we need Service Accounts Credentials).
- Returns the Custom Auth Token, oid, email, user display name and Azure AD access token to the `./auth.html` page.

The `./auth.html` receives the Custom Auth Token and other data back from the AJAX request to the `token` Function and uses it to update the user's profile, saves the access token to the database, authenticate the user in Firebase and then redirect to the index page.

At this point the main page will detect the sign-in through the Firebase Auth State observer and display the signed-In user information.
