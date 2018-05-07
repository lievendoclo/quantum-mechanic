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

```javascript
{
  "subatomic": {
    "commandPrefix": "sub",
    "gluon": {
      "baseUrl": "http://localhost:8080"
    },
    "openshift": {
      "dockerRepoUrl": "172.30.1.1:5000"
      "masterUrl": "<minishift ip>",
      "auth": {
        "token": "<subatomic service account token>"
      }
    },
    "bitbucket": {
      "baseUrl": "https://bitbucket.subatomic.local",
      "restUrl": "https://bitbucket.subatomic.local/rest",
      "caPath": "<local-hadron-collider>/minishift-addons/subatomic/certs/subatomic-ca-chain.pem",
      "auth": {
        "username": "subatomic",
        "password": "subatomic",
        "email": "subatomic@local"
      },
      "cicdPrivateKeyPath": "<laboratory>/jenkins/cicd.key",
      "cicdKey": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCzuPsKSdUwMVw7qQsNY0DQ0jCD3nAJSYoU7yHTgE2MLsRznNpec2dhjkzrgkWULXZlzFqf7MIJheYoIxHeoJzxrV+3nKT99FyFHSWJiEfk1G7PDRyptXspWRSvkhk8ovijVa7IeoYGLGxfGjF+gwO0dpyr/p8bX7t2+N0X0FZbkU7zjKJ5TrSgJuheVi7r1MO16Zr3k0uyRNDSDKPRt2IDmjRT9y6/ofhvFMn7JrMXkHpRYIJJQ/H2py63qYQatCpi38znBfke5fFoBK4L4/vALbH/Gjqj1J5Uadn8inGyrL0WxohWuhwk/K/bwOSw0LNO8bQ5lAmPgPgJYyA4Plm0onPLp1MZcO/Zj5UjEbmf3w+p2/Th0z6LxA0ytIedTYk8lz35h1yuINd1sp2VmiYS10pqJ1HW/3Mx7McwA8tLsuxKjYmOw4sIsunS+GQPPJbVQrB8ekx2CkD/nwf6fyH+RqtIQ6UBo+9013KwJKOd4qEGkKEN3kBzNoamOvfHvJROX7DQJKRux2/qJXggxJ8F7u0Hj5bSrhYbRNV9T9IfJPGWrJm56V+CbqA0mm7FmSuz2+EeUd3h5R8fxju75gbqFsCLnpuDhhUKxE2PMyRqAAaJ7AZYdXXl8NeNbWEPg/GgyEx4not76ibBDggkEjfYxYSU3689uVMhCv+VN2h6ew== Subatomic CI/CD"
    },
    "nexus": {
      "baseUrl": "https://nexus.subatomic.local/content/repositories/"
    },
    "maven": {
      "settingsPath": "<maven settings>/settings.xml"
    },
    "docs": {
      "baseUrl": "http://subatomic.bison.ninja"
    }
  },
  "teamId": "<team Id>",
  "token": "<GitHub token>",
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

Replace the relevant values above:

| Value         | Description | Source |
| ------------- | ----------- | ------ |
| `<minishift ip`> | The IP address of your minishift instance | Get the IP with `minishift ip` |
| `<subatomic service account token>` | The OpenShift Service Token used to authenticate | Get the token with `oc sa get-token subatomic -n subatomic` |
| `<local-hadron-collider>` | The directory where [local-hadron-collider](https://github.com/absa-subatomic/local-hadron-collider) has been cloned locally | `git clone https://github.com/absa-subatomic/local-hadron-collider.git` |
| `<laboratory>` | The directory where [laboratory](https://github.com/absa-subatomic/laboratory) has been cloned locally | `git clone https://github.com/absa-subatomic/laboratory.git` |
| `<maven settings>` | Directory containing a Maven `settings.xml` to use for Jenkins builds | Example `settings.xml` included [below](#maven-settings) |
| `<team Id>` | Slack team Id where the Atomist will respond to commands | See [Atomist documentation](https://docs.atomist.com/user/#slack-team-id) |
| `<GitHub token>` | GitHub token | See [Atomist documentation](https://docs.atomist.com/developer/prerequisites/#github-token) |

### Maven settings

Below is an example Maven settings file (`settings.xml`) that will be used to build projects in Jenkins:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<settings>
    <servers>
        <server>
            <id>nexus</id>
            <username>deployment</username>
            <password>deployment123</password>
        </server>
    </servers>
    <mirrors>
        <mirror>
            <id>nexus-repository</id>
            <name>Maven Repository Manager running on https://nexus.subatomic.local</name>
            <url>https://nexus.subatomic.local/content/groups/public/</url>
            <mirrorOf>external:*</mirrorOf>
        </mirror>
    </mirrors>
</settings>
```

> The `local.json` file is excluded in `.gitignore` and therfore will not be staged by Git.

Next run with:

```console
$ npm run compile start
...
xxx [m:15071] [info ] Opening WebSocket connection
xxx [m:15071] [info ] WebSocket connection established. Listening for incoming messages
```

### Testing

In order for tests to run you'll need to have a running local hadron collider environment:
https://github.com/absa-subatomic/local-hadron-collider

Once you have the environment setup, replace the token and masterUrl in the config.json
with the one's from openshift.

* test/gluon/team/DevOpsEnvironmentRequestedTest is currently skipped as it will make the Travis run fail. To execute this locally, simply remove the `.skip` and append the `.timeout(10000)`.

Next run with:
```console
$ npm run test
```