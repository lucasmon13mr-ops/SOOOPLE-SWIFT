import SwiftUI
import UIKit

@main
struct ThreeVApp: App {
    @StateObject private var store = Store()

    init() {
        ThreeVApp.configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
        }
    }

    /// Deixa barra de navegação, tab bar e listas no tema escuro do painel.
    static func configureAppearance() {
        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithOpaqueBackground()
        navAppearance.backgroundColor = UIColor(Theme.bg)
        navAppearance.titleTextAttributes = [.foregroundColor: UIColor(Theme.text)]
        navAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor(Theme.text)]
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        UINavigationBar.appearance().compactAppearance = navAppearance

        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = UIColor(Theme.bg2)
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance

        UITableView.appearance().backgroundColor = .clear
        UITextField.appearance().tintColor = UIColor(Theme.accent)
    }
}

struct RootView: View {
    @EnvironmentObject private var store: Store

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            if store.isBootstrapping {
                LoadingView(text: "Verificando sessão…")
            } else if store.isLoggedIn {
                MainTabView()
                    .transition(.opacity)
            } else {
                LoginView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: store.isLoggedIn)
        .task {
            if store.isBootstrapping {
                await store.bootstrap()
            }
        }
        .alert("Aviso", isPresented: Binding(
            get: { store.notice != nil },
            set: { if !$0 { store.notice = nil } }
        )) {
            Button("Entendi") { store.notice = nil }
        } message: {
            Text(store.notice ?? "")
        }
    }
}
