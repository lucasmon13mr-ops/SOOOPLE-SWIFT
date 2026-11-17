import SwiftUI

struct MainTabView: View {
    @EnvironmentObject private var store: Store
    @State private var selection = 0

    var body: some View {
        TabView(selection: $selection) {
            DashboardView()
                .tabItem { Label("Painel", systemImage: "square.grid.2x2.fill") }
                .tag(0)

            PackagesView()
                .tabItem { Label("Pacotes", systemImage: "shippingbox.fill") }
                .tag(1)

            LicensesView()
                .tabItem { Label("Licenças", systemImage: "key.fill") }
                .tag(2)

            DevicesView()
                .tabItem { Label("Aparelhos", systemImage: "iphone") }
                .tag(3)

            MoreView()
                .tabItem { Label("Mais", systemImage: "ellipsis.circle.fill") }
                .tag(4)
        }
        .tint(store.menuAccent)
    }
}
