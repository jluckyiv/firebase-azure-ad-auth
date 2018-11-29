# Use Azure AD Sign In with Firebase

This sample shows how to authenticate using Azure AD Sign-In on Firebase. It's copied from from [Firebase's function-samples repo](https://github.com/firebase/functions-samples/tree/master), specifically the [instagram-auth](https://github.com/firebase/functions-samples/tree/master/instagram-auth) sample. This model uses redirect instead of popup to be a little more mobile-friendly.

In this sample we use OAuth 2.0 based authentication to get Azure AD user information then create a Firebase Custom Token (using the `oid` from the Azure AD `id_token`).

## Setup the sample

Create and setup the Firebase project:

1. Create a Firebase project using the [Firebase Developer Console](https://console.firebase.google.com).
1. Enable Billing on your Firebase the project by switching to the **Blaze** plan, this is currently needed to be able to perform HTTP requests to external services from a Cloud Function.

Create and provide a Service Account's credentials:

1. Create a Service Accounts file as described in the [Server SDK setup instructions](https://firebase.google.com/docs/server/setup#add_firebase_to_your_app).
1. Save the Service Account credential file as `./functions/service-account.json`
1. Add `service-account.json` to `.gitignore`.

Create and setup your Azure AD app:

1. Register an Azure AD app on the [Microsoft Application Registration Portal](https://apps.dev.microsoft.com/). You'll need to **Add an app**.
1. Once your app is created make sure you specify your app's callback URL in the list of **Valid redirect URLs** of your Azure AD app. You should whitelist `https://localhost:5000/auth.html` for local development and if you deploy on App Engine (See Deploy section below) you should whitelist the URL `https://<application-id>.firebaseapp.com/auth.html`.
1. Generate a new password and copy the **Application ID** and **Password** of your Azure AD app and use them to set the `azure.client_id` and `azure.client_secret` Google Cloud environment variables. For this use:

  ```bash
  firebase functions:config:set azure.client_id="yourApplicationID" azure.client_secret="yourPassword"
  ```

> Make sure the Azure AD Password is always kept secret. For instance do not save it in your version control system.

1. Optionally set your `azure.tenant_id` environment variable. Find your Tenant (Directory) ID in the App Registrations (Preview) tab of the [Azure Active Directory Blade](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/Overview) of the [Azure Portal](https://portal.azure.com/). If you don't set the variable, the code will use the `common` Azure AD endpoints.

  ```bash
  firebase functions:config:set azure.tenant_id="yourTentantId"
  ```

Deploy your project:

1. Run `firebase use --add` and choose your Firebase project. This will configure the Firebase CLI to use the correct project locally.
1. Run `firebase deploy` to effectively deploy the sample. The first time the Functions are deployed the process can take several minutes.

## Run the sample

Open the sample's website by using `firebase open hosting:site` or directly accessing `https://<project-id>.firebaseapp.com/`.

Click on the **Sign in with Azure AD** button and the page will redirect to a page that will show the Azure AD authentication consent screen. Sign in and/or authorize the authentication request.

The website should display your name and email address from Azure AD. At this point you are authenticated in Firebase and can use the database/hosting etc...

## Workflow and design

When clicking the **Sign in with Azure AD** button the page redirects users to the `redirect` Function URL.

The `redirect` Function then redirects the user to the Azure AD OAuth 2.0 consent screen where (the first time only) the user will have to grant approval. Also the `state` cookie is set on the client with the value of the `state` URL query parameter to check against later on.

After the user has granted approval the user is redirected back to the `./auth.html` page along with an OAuth 2.0 Auth Code as a URL parameter. This Auth code is then sent to the `token` Function using a JSONP Request. The `token` function then:

- Checks that the value of the `state` URL query parameter is the same as the one in the `state` cookie.
- Exchanges the auth code for an access token using the Azure AD app credentials and gets the user identity (oid, email, and full name).
- Mints a Custom Auth token (which is why we need Service Accounts Credentials).
- Returns the Custom Auth Token, oid, email, user display name and Azure AD access token to the `./auth.html` page.

The `./auth.html` receives the Custom Auth Token and other data back from the AJAX request to the `token` Function and uses it to update the user's profile, saves the access token to the database, authenticate the user in Firebase and then redirect to the index page.

At this point the main page will detect the sign-in through the Firebase Auth State observer and display the signed-In user information.
