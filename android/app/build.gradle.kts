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
        versionCode = 6
        versionName = "1.5"

        // O app é uma casca: a interface continua vindo do GitHub Pages, então
        // publicar o T-RESULTS segue sendo copiar o index.html para a main.
        buildConfigField("String", "ENDERECO", "\"https://pedrocrvgdf.github.io/appcutting/\"")
    }

    /*
     * A chave de assinatura.
     *
     * Antes o APK saía assinado com a chave de depuração que o Gradle inventa na
     * hora — e como cada execução do GitHub Actions roda numa máquina nova, cada
     * build saía com uma chave DIFERENTE. O Android recusa instalar por cima de
     * um app assinado por outra chave, então atualizar exigia desinstalar, e
     * desinstalar apaga o armazenamento do WebView: o treino em andamento, o
     * tema e a senha guardada da digital iam junto.
     *
     * Agora a chave é fixa e vem de segredos do repositório. Sem eles (num pull
     * request, por exemplo) a configuração fica nula e só o `assembleDebug`
     * roda — que é o suficiente para conferir se o código compila.
     */
    val chave = System.getenv("CHAVE_ARQUIVO")

    signingConfigs {
        if (!chave.isNullOrBlank()) {
            create("publicacao") {
                storeFile = file(chave)
                storePassword = System.getenv("CHAVE_SENHA")
                keyAlias = System.getenv("CHAVE_ALIAS") ?: "tresults"
                keyPassword = System.getenv("CHAVE_SENHA")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("publicacao")
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
