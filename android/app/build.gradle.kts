plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.pedrocrvgdf.tresults"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pedrocrvgdf.tresults"
        minSdk = 26          // Android 8: primeira versão com canais de notificação
        targetSdk = 35
        versionCode = 4
        versionName = "1.3"

        // O app é uma casca: a interface continua vindo do GitHub Pages, então
        // publicar o T-RESULTS segue sendo copiar o index.html para a main.
        buildConfigField("String", "ENDERECO", "\"https://pedrocrvgdf.github.io/appcutting/\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    // trava por digital, com PIN como alternativa (ver Biometria.kt)
    implementation("androidx.biometric:biometric:1.1.0")
}
