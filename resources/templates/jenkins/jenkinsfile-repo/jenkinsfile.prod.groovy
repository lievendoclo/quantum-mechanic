def project = "${env.JOB_NAME.split('/')[0]}"
def app = "${env.JOB_NAME.split('/')[1].replace('-prod','')}"
def sourceImageName
def devOpsProjectId
def imageStreamName
def prodProjectId


def copyAndDeploy(imageStreamName, devOpsProjectId, prodProjectId, app) {
    openshift.withProject(devOpsProjectId) {
        openshift.tag("$devOpsProjectId/$imageStreamName", "$prodProjectId/$imageStreamName")
    }
    openshift.withProject(prodProjectId) {

        def dc = openshift.selector('dc', app);
        for (trigger in dc.object().spec.triggers) {
            if (trigger.type == "ImageChange") {
                def oldImageStreamName = trigger.imageChangeParams.from.name
                echo "Current ImageStream tag: ${oldImageStreamName}"
                echo "New ImageStream tag: ${imageStreamName}"
                if (oldImageStreamName != "${imageStreamName}") {
                    openshift.selector('dc', app).patch("\'{ \"spec\": { \"triggers\": [{ \"type\": \"ImageChange\", \"imageChangeParams\": { \"automatic\": false, \"containerNames\": [\"${app}\"], \"from\": { \"kind\": \"ImageStreamTag\", \"name\": \"${imageStreamName}\" } } }] } }\'")
                }
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

withCredentials([
        string(credentialsId: 'devops-project', variable: 'DEVOPS_PROJECT_ID'),
        string(credentialsId: 'uat-project', variable: 'UAT_PROJECT_ID')
]) {
	// add prod deploy stuff here
}