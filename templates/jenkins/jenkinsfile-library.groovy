node('maven') {

    withCredentials([
            string(credentialsId: 'nexus-base-url', variable: 'NEXUS_BASE_URL'),
            file(credentialsId: 'maven-settings', variable: 'MVN_SETTINGS'),
    ]) {
        stage('Checks and Tests') {
            checkout(scm)

            try {
                sh ': Maven build &&' +
                     ' ./mvnw --batch-mode verify --settings $MVN_SETTINGS' +
                     ' || mvn --batch-mode verify --settings $MVN_SETTINGS' +
                     ' -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn' +
                     ' -Dmaven.test.redirectTestOutputToFile=true'
            } finally {
                junit 'target/surefire-reports/*.xml'
            }
        }

        if (env.BRANCH_NAME == 'master' || !env.BRANCH_NAME) {
            stage('Publish to Nexus') {
                repository = 'releases'
                pom = readMavenPom file: 'pom.xml'
                if (pom.version.endsWith('SNAPSHOT')) {
                    repository = 'snapshots'
                }

                sh ': Maven deploy &&' +
                     ' ./mvnw --batch-mode deploy --settings $MVN_SETTINGS -DskipTests' +
                     ' -DaltDeploymentRepository=nexus::default::${env.NEXUS_BASE_URL}/${repository}/' +
                     ' || mvn --batch-mode deploy --settings $MVN_SETTINGS -DskipTests' +
                     ' -DaltDeploymentRepository=nexus::default::${env.NEXUS_BASE_URL}/${repository}/' +
                     ' -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn'
            }
        }
    }
}
