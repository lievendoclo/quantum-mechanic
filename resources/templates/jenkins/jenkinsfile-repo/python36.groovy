/**
 * Jenkins pipeline to build an application with the GitHub flow in mind (https://guides.github.com/introduction/flow/).
 *
 * This pipeline requires the following credentials:
 * ---
 * Type          | ID                | Description
 * Secret text   | devops-project    | The OpenShift project Id of the DevOps project that this Jenkins instance is running in
 * Secret text   | dev-project       | The OpenShift project Id of the project's development environment
 * Secret text   | sit-project       | The OpenShift project Id of the project's sit environment
 * Secret text   | uat-project       | The OpenShift project Id of the project's uat environment
 * Secret text   | docker-registry-ip| The OpenShift docker registry ip
 *
 */

def deploy(project, app, tag) {
    openshift.withProject(project) {
        def dc = openshift.selector('dc', app);
        for (trigger in dc.object().spec.triggers) {
            if (trigger.type == "ImageChange") {
                def imageStreamName = trigger.imageChangeParams.from.name
                echo "Current ImageStream tag: ${imageStreamName}"
                echo "New ImageStream tag: ${app}:${tag}"
                if (imageStreamName != "${app}:${tag}") {
                    openshift.selector('dc', app).patch("\'{ \"spec\": { \"triggers\": [{ \"type\": \"ImageChange\", \"imageChangeParams\": { \"automatic\": false, \"containerNames\": [\"${app}\"], \"from\": { \"kind\": \"ImageStreamTag\", \"name\": \"${app}:${tag}\" } } }] } }\'")
                }
                def latestVersion = dc.object().status.latestVersion
                if (latestVersion != 0){
                    break
                }
                echo "Running initial deployment"
            }
            openshift.selector('dc', app).rollout().latest()

            timeout(5) {
                def deploymentObject = openshift.selector('dc', "${app}").object()
                if (deploymentObject.spec.replicas > 0) {
                    def latestDeploymentVersion = deploymentObject.status.latestVersion
                    def replicationController = openshift.selector('rc', "${app}-${latestDeploymentVersion}")
                    replicationController.untilEach(1) {
                        def replicationControllerMap = it.object()
                        echo "Replicas: ${replicationControllerMap.status.readyReplicas}"
                        return (replicationControllerMap.status.replicas.equals(replicationControllerMap.status.readyReplicas))
                    }
                } else {
                    echo "Deployment has a replica count of 0. Not waiting for Pods to become healthy..."
                }
            }
        }
    }
}

def executeInVEnv(String script) {
    sh "source /venv_home/venv/bin/activate && " + script
}

def label = "python36-${UUID.randomUUID().toString()}"

def teamDevOpsProject
def dockerRegistryIp

withCredentials([
        string(credentialsId: 'devops-project', variable: 'DEVOPS_PROJECT_ID'),
        string(credentialsId: 'docker-registry-ip', variable: 'DOCKER_REGISTRY_IP')
]) {
    teamDevOpsProject = "${env.DEVOPS_PROJECT_ID}"
    dockerRegistryIp = "${env.DOCKER_REGISTRY_IP}"
}

echo "Starting to try find pod template: " + dockerRegistryIp + '/' + teamDevOpsProject + '/jenkins-slave-python36-subatomic:2.0'

podTemplate(cloud: "openshift", label: label, serviceAccount:"jenkins", containers: [
    containerTemplate(name: 'jnlp', image: dockerRegistryIp + '/' + teamDevOpsProject + '/jenkins-slave-python36-subatomic:2.0', ttyEnabled: false, alwaysPullImage: true, args: '${computer.jnlpmac} ${computer.name}')
  ])
{
  	echo "Trying to get node " + label
    node(label) {
      	def projectDevProject
        def projectSitProject
        def projectUatProject

        withCredentials([
                string(credentialsId: 'dev-project', variable: 'DEV_PROJECT_ID'),
                string(credentialsId: 'sit-project', variable: 'SIT_PROJECT_ID'),
                string(credentialsId: 'uat-project', variable: 'UAT_PROJECT_ID')
        ]) {
            projectDevProject = "${env.DEV_PROJECT_ID}"
            projectSitProject = "${env.SIT_PROJECT_ID}"
            projectUatProject = "${env.UAT_PROJECT_ID}"
        }

        def project = "${env.JOB_NAME.split('/')[0]}"
        def app = "${env.JOB_NAME.split('/')[1]}"
        def appBuildConfig = "${project}-${app}"

        def tag
        stage('Run python stage') {
            container('jnlp') {
                stage('Run Python Checks and Tests') {
                    final scmVars = checkout(scm)

                    def shortGitCommit = scmVars.GIT_COMMIT[0..6]
                    def verCode = UUID.randomUUID().toString()[0..8]
                    tag = "${verCode}-${shortGitCommit}"
                    // Run any tests or build commands here
                    // executeInVEnv 'python -m pip install pytest && python -m pip install -r requirements.txt'
                    // executeInVEnv 'python -m pytest testing/'
                }
            }
        }
        if (env.BRANCH_NAME == 'master' || !env.BRANCH_NAME) {
            stage('OpenShift Build') {
                openshift.withProject(teamDevOpsProject) {
                    def bc = openshift.selector("bc/${appBuildConfig}")

                    def buildConfig = bc.object()
                    def outputImage = buildConfig.spec.output.to.name
                    echo "Current tag: ${outputImage}"
                    if (outputImage != "${appBuildConfig}:${tag}") {
                        bc.patch("\'{ \"spec\": { \"output\": { \"to\": { \"name\": \"${appBuildConfig}:${tag}\" } } } }\'")
                        def build = bc.startBuild();
                        timeout(5) {
                            build.untilEach(1) {
                                return it.object().status.phase == "Complete"
                            }
                        }
                    }
                }
            }

            stage('Deploy to DEV') {
                sh ': Deploying to DEV...'

                openshift.withProject(teamDevOpsProject) {
                    openshift.tag("${teamDevOpsProject}/${appBuildConfig}:${tag}", "${projectDevProject}/${app}:${tag}")
                }

                deploy(projectDevProject, app, tag);
            }

            stage('Deploy to SIT') {
                sh ': Deploying to SIT...'

                openshift.withProject(projectDevProject) {
                    openshift.tag("${projectDevProject}/${app}:${tag}", "${projectSitProject}/${app}:${tag}")
                }

                deploy(projectSitProject, app, tag)
            }

            stage('Deploy to UAT') {
                sh ': Deploying to UAT...'

                input "Confirm deployment to UAT"

                openshift.withProject(projectSitProject) {
                    openshift.tag("${projectSitProject}/${app}:${tag}", "${projectUatProject}/${app}:${tag}")
                }

                deploy(projectUatProject, app, tag);
            }
        }
    }
}