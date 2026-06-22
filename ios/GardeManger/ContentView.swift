import SwiftUI

struct ContentView: View {
    var body: some View {
        WebAppView()
            .ignoresSafeArea(.container, edges: .bottom)
    }
}

#Preview {
    ContentView()
}
