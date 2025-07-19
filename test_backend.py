#!/usr/bin/env python3
"""
Test script to verify backend HTTPS connection
"""

import requests
import ssl
import urllib3

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def test_backend_connection():
    """Test both HTTP and HTTPS connections to the backend."""
    
    print("🔍 Testing backend connections...")
    
    # Test HTTP connection
    try:
        response = requests.get("http://localhost:8000/health", timeout=5)
        print(f"✅ HTTP connection successful: {response.status_code}")
        print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"❌ HTTP connection failed: {e}")
    
    # Test HTTPS connection
    try:
        response = requests.get("https://localhost:8000/health", verify=False, timeout=5)
        print(f"✅ HTTPS connection successful: {response.status_code}")
        print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"❌ HTTPS connection failed: {e}")
    
    # Test API endpoint
    try:
        response = requests.get("https://localhost:8000/api/social/accounts", verify=False, timeout=5)
        print(f"✅ API endpoint test: {response.status_code}")
    except Exception as e:
        print(f"❌ API endpoint test failed: {e}")

if __name__ == "__main__":
    test_backend_connection() 