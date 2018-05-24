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

node('maven') {

    def teamDevOpsProject
    def projectDevProject
    def projectSitProject
    def projectUatProject

    withCredentials([
            string(credentialsId: 'devops-project', variable: 'DEVOPS_PROJECT_ID'),
            string(credentialsId: 'dev-project', variable: 'DEV_PROJECT_ID'),
            string(credentialsId: 'sit-project', variable: 'SIT_PROJECT_ID'),
            string(credentialsId: 'uat-project', variable: 'UAT_PROJECT_ID')
    ]) {
        teamDevOpsProject = "${env.DEVOPS_PROJECT_ID}"
        projectDevProject = "${env.DEV_PROJECT_ID}"
        projectSitProject = "${env.SIT_PROJECT_ID}"
        projectUatProject = "${env.UAT_PROJECT_ID}"
    }

    def project = "${env.JOB_NAME.split('/')[0]}"
    def app = "${env.JOB_NAME.split('/')[1]}"
    def appBuildConfig = "${project}-${app}"

    def tag

    stage('Checks and Tests') {
        final scmVars = checkout(scm)

        def shortGitCommit = scmVars.GIT_COMMIT[0..6]
        def pom = readMavenPom file: 'pom.xml'
        tag = "${pom.version}-${shortGitCommit}"
        echo "Building application ${app}:${tag} from commit ${scmVars} with BuildConfig ${appBuildConfig}"

        try {
            withCredentials([
                    file(credentialsId: 'maven-settings', variable: 'MVN_SETTINGS')
            ]) {
                sh ': Maven build &&' +
                        " ./mvnw --batch-mode test --settings $MVN_SETTINGS" +
                        " || mvn --batch-mode test --settings $MVN_SETTINGS" +
                        ' -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn' +
                        ' -Dmaven.test.redirectTestOutputToFile=true'
            }
        } finally {
            junit 'target/surefire-reports/*.xml'
        }

        // TODO split unit and integration tests
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
                }
                def build = bc.startBuild()
                def result = "Pending"
                timeout(5) {
                    build.untilEach(1) {
                      result = it.object().status.phase
                      return result == "Complete" || result == "Failed"
                    }
                }
                if (result == "Failed"){
                  error("Build failed")
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