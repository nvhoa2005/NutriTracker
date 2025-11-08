import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import {
  Activity,
  LayoutDashboard,
  Camera,
  BarChart3,
  User,
  LogOut,
  MessageCircle,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Upload Food", href: "/upload", icon: Camera },
    { name: "Tracker", href: "/tracker", icon: BarChart3 },
    { name: "AI Assistant", href: "/chatbot", icon: MessageCircle },
    { name: "Profile", href: "/profile", icon: User },
  ];

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/dashboard">
              <a className="flex items-center gap-2 text-primary hover-elevate active-elevate-2 px-2 py-1 rounded-lg">
                <Activity className="h-8 w-8" />
                <span className="text-xl font-bold font-['Poppins']">CalorieTrack</span>
              </a>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link key={item.name} href={item.href}>
                    <a>
                      <Button
                        variant={isActive ? "default" : "ghost"}
                        className="gap-2"
                        data-testid={`link-${item.name.toLowerCase().replace(" ", "-")}`}
                      >
                        <Icon className="h-5 w-5" />
                        {item.name}
                      </Button>
                    </a>
                  </Link>
                );
              })}
            </nav>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <div className="hidden md:flex items-center gap-3 ml-2">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                    {user?.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  data-testid="button-logout"
                  title="Logout"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden border-t py-2">
            <nav className="flex items-center gap-1 overflow-x-auto">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link key={item.name} href={item.href}>
                    <a>
                      <Button
                        variant={isActive ? "default" : "ghost"}
                        size="sm"
                        className="gap-2 flex-shrink-0"
                        data-testid={`link-mobile-${item.name.toLowerCase().replace(" ", "-")}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-xs">{item.name}</span>
                      </Button>
                    </a>
                  </Link>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-2 flex-shrink-0"
                data-testid="button-mobile-logout"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-xs">Logout</span>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>© 2025 CalorieTrack. Track your nutrition, achieve your goals.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
