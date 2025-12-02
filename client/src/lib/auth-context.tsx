import { createContext, useContext, useState, useEffect } from "react";
import type { UserProfile } from "@shared/schema";
import { apiRequest } from "./queryClient"; // Import thêm apiRequest
import { useToast } from "@/hooks/use-toast"; // Import toast để thông báo (tùy chọn)

interface AuthContextType {
  user: UserProfile | null;
  login: (user: UserProfile) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // 1. Lấy user từ localStorage để hiển thị UI ngay lập tức
    const storedUser = localStorage.getItem("user");
    
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);

      // 2. [QUAN TRỌNG] Kiểm tra xem Session trên Server còn sống không
      // Nếu server vừa restart, session sẽ mất, ta cần logout ở client luôn.
      validateSession();
    }
  }, []);

  const validateSession = async () => {
    try {
      // Gọi thử API lấy profile để xem server có nhận ra mình không
      await apiRequest("GET", "/api/user/profile");
    } catch (error) {
      // Nếu lỗi (thường là 401 Unauthorized do mất session), thực hiện logout
      console.log("Session expired or invalid, logging out...");
      logout();
      toast({
        title: "Session Expired",
        description: "Please login again.",
        variant: "destructive",
      });
    }
  };

  const login = (userData: UserProfile) => {
    setUser(userData);
    localStorage.setItem("user", JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
    // Có thể thêm lệnh chuyển hướng về login nếu cần thiết, 
    // nhưng thường router sẽ tự xử lý khi user = null
    window.location.href = "/login"; 
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}