# Quantum Mechanic [![Build Status](https://travis-ci.org/absa-subatomic/quantum-mechanic.svg?branch=master)](https://travis-ci.org/absa-subatomic/quantum-mechanic) [![codecov](https://codecov.io/gh/absa-subatomic/quantum-mechanic/branch/master/graph/badge.svg)](https://codecov.io/gh/absa-subatomic/quantum-mechanic) [![Maintainability](https://api.codeclimate.com/v1/badges/fe42b9266ff703473d1a/maintainability)](https://codeclimate.com/github/absa-subatomic/quantum-mechanic/maintainability)

An Atomist [automation client](https://github.com/atomist/automation-client-ts)
with command and event handlers for integration between various external infrastructure components.

## Development setup

Quantum Mechanic is just an Atomist Automation Client.
Therefore, follow the instructions for [Running the Automation Client](https://github.com/atomist/automation-client-ts#running-the-automation-client)
from the [`automation-client-ts`](https://github.com/atomist/automation-client-ts) GitHub repository.

### Local configuration

Instead of editing the `atomist.config.ts` file for local development, you can create
a new `config/local.json` file. This file can provide local configuration values over and above
the default configurations.

Here is an example `local.json`:

```json
{
  "subatomic": {
    "commandPrefix" : "sub",
    "openshiftHost" : "",
    "bitbucketHost" : ""
  },
  "teamId": "T8RGCSXXX",
  "token": "d315704661723b8c0a0906bf2a51fde80057xxx",
  // lifecycle configuration
  "lifecycles": {
    "push": {
      "configuration": {
        "emoji-style": "default",
        "show-statuses-on-push": true,
        "build": {
          "style": "decorator"
        },
        "fingerprints": {
          "about-hint": false,
          "render-unchanged": true,
          "style": "fingerprint-inline"
        }
      }
    },
    "pull_request": {
      "configuration": {
        "emoji-style": "default"
      }
    }
  },
  "fingerprints": {
    "data": {
    }
  }
}
```

Replace the relevant values for `teamId` and `token` with those that match your test environment.

> The `local.json` file is excluded in `.gitignore` and therfore will not be staged by Git.

Next run with:

```console
$ npm run compile start
...
xxx [m:15071] [info ] Opening WebSocket connection
xxx [m:15071] [info ] WebSocket connection established. Listening for incoming messages
```
